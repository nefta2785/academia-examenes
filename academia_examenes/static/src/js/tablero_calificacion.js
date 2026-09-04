import { Component, onWillStart, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { PanelCalificacion } from "./panel_calificacion";

// Geometría de la "mesa": un lienzo de posición libre donde el sinodal
// arrastra las tarjetas para reproducir la distribución física real de los
// alumnos durante el examen. Es una vista PERSONAL: no se sincroniza entre
// distintos sinodales/dispositivos.
const ANCHO_TARJETA = 360;
const ALTO_TARJETA = 140;      // huella aproximada de una tarjeta colapsada
const ANCHO_LIENZO = 1400;
const ALTO_LIENZO_MAX = 3000;
const SEPARACION = 16;
const HOLGURA_ENCIMADO = 40;   // px de traslape tolerado antes de considerar "encimadas"

export class TableroCalificacion extends Component {
    static template = "academia_examenes.TableroCalificacion";
    static components = { PanelCalificacion };
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.lienzoRef = useRef("lienzo");
        this.ANCHO_LIENZO = ANCHO_LIENZO;

        this.state = useState({
            cargando: true,
            roster: [],
            resultadoLabels: {},
            progreso: {},
            ordenPor: "nombre",
            rosterColapsado: false,
            // 'mesa': exámenes en la mesa. 'posiciones': {examenId: {x, y}} en px
            // dentro del lienzo. 'tarjetasAbiertas': cuáles muestran el panel
            // completo. 'expandido': tarjeta a pantalla completa, o null.
            // 'arrastrando': examenId que se está arrastrando (para el z-index).
            mesa: [],
            posiciones: {},
            tarjetasAbiertas: [],
            expandido: null,
            arrastrando: null,
        });

        // Estado vivo del arrastre en curso + listeners globales estables.
        this._arrastre = null;
        this._onMove = (ev) => this._alMover(ev);
        this._onUp = (ev) => this._alSoltar(ev);

        onWillStart(async () => {
            const eventoId = this.props.action.params.evento_id;

            // 1) Todos los exámenes del evento (incluye la posición guardada).
            const examenes = await this.orm.searchRead(
                "rubrica.examen",
                [["evento_id", "=", eventoId]],
                [
                    "alumno_id", "plantilla_id", "nivel_evaluado", "resultado",
                    "mejor_examen", "posicion_x", "posicion_y",
                ]
            );
            const examenIds = examenes.map((e) => e.id);

            // 2) Datos de TODOS los alumnos, en una llamada.
            const alumnoIds = [...new Set(examenes.map((e) => e.alumno_id[0]))];
            const alumnos = alumnoIds.length
                ? await this.orm.read("rubrica.alumno", alumnoIds, ["name", "foto"])
                : [];
            const alumnoPorId = Object.fromEntries(alumnos.map((a) => [a.id, a]));

            // 3) Total de criterios por plantilla (para el contador "x/N").
            const plantillaIds = [...new Set(examenes.map((e) => e.plantilla_id[0]))];
            const grupos = plantillaIds.length
                ? await this.orm.searchRead(
                      "rubrica.grupo",
                      [["plantilla_id", "in", plantillaIds]],
                      ["plantilla_id", "criterios_ids"]
                  )
                : [];
            const totalPorPlantilla = {};
            for (const grupo of grupos) {
                const pid = grupo.plantilla_id[0];
                totalPorPlantilla[pid] = (totalPorPlantilla[pid] || 0) + grupo.criterios_ids.length;
            }

            // 4) Criterios ya calificados de TODOS los exámenes, en una llamada.
            const calificados = examenIds.length
                ? await this.orm.searchRead(
                      "rubrica.criterio_calificado",
                      [["examen_id", "in", examenIds]],
                      ["examen_id", "valor_cualitativo", "valor_numerico"]
                  )
                : [];
            const progreso = Object.fromEntries(examenIds.map((id) => [id, 0]));
            for (const c of calificados) {
                if (c.valor_cualitativo || c.valor_numerico) {
                    progreso[c.examen_id[0]] += 1;
                }
            }
            this.state.progreso = progreso;

            // 5) Etiquetas del Selection 'resultado'.
            const campos = await this.orm.call("rubrica.examen", "fields_get", [], {
                allfields: ["resultado"],
                attributes: ["selection"],
            });
            this.state.resultadoLabels = Object.fromEntries(campos.resultado.selection);

            this.state.roster = examenes.map((examen) => {
                const alumno = alumnoPorId[examen.alumno_id[0]] || {
                    name: examen.alumno_id[1],
                    foto: false,
                };
                return {
                    examenId: examen.id,
                    name: alumno.name,
                    foto: alumno.foto,
                    nivelEvaluado: examen.nivel_evaluado || "",
                    plantillaNombre: examen.plantilla_id[1],
                    resultado: examen.resultado,
                    mejorExamen: examen.mejor_examen,
                    totalCriterios: totalPorPlantilla[examen.plantilla_id[0]] || 0,
                };
            });

            // Restaurar la mesa personal: todo examen con posición guardada
            // (x o y != 0) vuelve a la mesa, colapsado, donde se dejó.
            const mesa = [];
            const posiciones = {};
            for (const examen of examenes) {
                if (examen.posicion_x || examen.posicion_y) {
                    mesa.push(examen.id);
                    posiciones[examen.id] = { x: examen.posicion_x, y: examen.posicion_y };
                }
            }
            this.state.mesa = mesa;
            this.state.posiciones = posiciones;
            this._corregirEncimados();

            this.state.cargando = false;
        });

        onWillUnmount(() => this._quitarListenersGlobales());
    }

    // ---- roster / orden --------------------------------------------------

    get rosterOrdenado() {
        const roster = [...this.state.roster];
        if (this.state.ordenPor === "nivel") {
            roster.sort((a, b) => (a.nivelEvaluado || "").localeCompare(b.nivelEvaluado || ""));
        } else {
            roster.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
        return roster;
    }

    get rosterPorExamenId() {
        return Object.fromEntries(this.state.roster.map((i) => [i.examenId, i]));
    }

    ordenarPor(criterio) {
        this.state.ordenPor = criterio;
    }

    alternarRoster() {
        this.state.rosterColapsado = !this.state.rosterColapsado;
    }

    // ---- mesa: agregar / quitar / abrir / expandir ---------------------

    agregarAMesa(examenId) {
        if (this.state.mesa.includes(examenId)) {
            return;
        }
        // Si ya tenía posición (el sinodal lo había acomodado y luego lo
        // quitó), se respeta y reaparece ahí. Solo si nunca tuvo posición
        // se le asigna un hueco automático.
        if (!this.state.posiciones[examenId]) {
            this.state.posiciones[examenId] = this._siguienteSlot();
        }
        this.state.mesa.push(examenId);
    }

    quitarDeMesa(examenId) {
        // "Quitar" es PURAMENTE VISUAL: solo saca el examenId del arreglo
        // 'mesa'. NO se borra 'state.posiciones[examenId]' ni se toca
        // posicion_x/posicion_y en el servidor, para que al volver a agregar
        // al alumno con "+" reaparezca exactamente donde el sinodal lo dejó.
        this.state.mesa = this.state.mesa.filter((id) => id !== examenId);
        this.state.tarjetasAbiertas = this.state.tarjetasAbiertas.filter((id) => id !== examenId);
        if (this.state.expandido === examenId) {
            this.state.expandido = null;
        }
    }

    estaAbierta(examenId) {
        return this.state.tarjetasAbiertas.includes(examenId);
    }

    alternarTarjeta(examenId) {
        if (this.state.tarjetasAbiertas.includes(examenId)) {
            this.state.tarjetasAbiertas = this.state.tarjetasAbiertas.filter((id) => id !== examenId);
        } else {
            this.state.tarjetasAbiertas.push(examenId);
        }
    }

    expandir(examenId) {
        this.state.expandido = examenId;
    }

    regresar() {
        this.state.expandido = null;
    }

    etiquetaResultado(valor) {
        return this.state.resultadoLabels[valor] || valor;
    }

    // ---- geometría del lienzo -----------------------------------------

    get altoLienzo() {
        let maxAbajo = 700;
        for (const id of this.state.mesa) {
            const p = this.state.posiciones[id];
            if (!p) {
                continue;
            }
            const alto = this.estaAbierta(id) ? 720 : ALTO_TARJETA;
            maxAbajo = Math.max(maxAbajo, p.y + alto);
        }
        return Math.min(maxAbajo + 80, ALTO_LIENZO_MAX);
    }

    posicionTarjeta(examenId) {
        const p = this.state.posiciones[examenId] || { x: 0, y: 0 };
        let z = 10;
        if (this.state.arrastrando === examenId) {
            z = 30;
        } else if (this.estaAbierta(examenId)) {
            z = 20;
        }
        return `left:${p.x}px; top:${p.y}px; width:${ANCHO_TARJETA}px; z-index:${z};`;
    }

    _choca(x, y, colocadas) {
        return colocadas.some(
            (c) =>
                Math.abs(c.x - x) < ANCHO_TARJETA - HOLGURA_ENCIMADO &&
                Math.abs(c.y - y) < ALTO_TARJETA - HOLGURA_ENCIMADO
        );
    }

    _limitar(x, y) {
        const maxX = Math.max(0, ANCHO_LIENZO - ANCHO_TARJETA);
        const maxY = Math.max(0, this.altoLienzo - ALTO_TARJETA);
        return [Math.max(0, Math.min(x, maxX)), Math.max(0, Math.min(y, maxY))];
    }

    _siguienteSlot() {
        const colocadas = this.state.mesa
            .map((id) => this.state.posiciones[id])
            .filter(Boolean);
        const cols = Math.max(1, Math.floor(ANCHO_LIENZO / (ANCHO_TARJETA + SEPARACION)));
        for (let fila = 0; fila < 60; fila++) {
            for (let col = 0; col < cols; col++) {
                const x = col * (ANCHO_TARJETA + SEPARACION);
                const y = fila * (ALTO_TARJETA + SEPARACION);
                if (!this._choca(x, y, colocadas)) {
                    return { x, y };
                }
            }
        }
        return { x: 0, y: 0 };
    }

    _espacioLibreCercano(x, y, colocadas) {
        if (!this._choca(x, y, colocadas)) {
            return { x, y };
        }
        const paso = 30;
        for (let radio = 1; radio <= 60; radio++) {
            for (let dx = -radio; dx <= radio; dx++) {
                for (let dy = -radio; dy <= radio; dy++) {
                    // solo el anillo exterior de este radio
                    if (Math.abs(dx) !== radio && Math.abs(dy) !== radio) {
                        continue;
                    }
                    const [nx, ny] = this._limitar(x + dx * paso, y + dy * paso);
                    if (!this._choca(nx, ny, colocadas)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return { x, y };
    }

    _corregirEncimados() {
        // Al cargar posiciones guardadas: si dos tarjetas caen encimadas,
        // reubica la segunda al espacio libre más cercano.
        const colocadas = [];
        for (const id of this.state.mesa) {
            const p = this.state.posiciones[id];
            if (!p) {
                continue;
            }
            const [x0, y0] = this._limitar(p.x, p.y);
            const libre = this._espacioLibreCercano(x0, y0, colocadas);
            this.state.posiciones[id] = libre;
            colocadas.push(libre);
        }
    }

    // ---- arrastre con Pointer Events (mouse + táctil) ------------------

    alPresionar(ev, examenId) {
        // Ignora botones secundarios del mouse (para toque/lápiz button es 0).
        if (ev.button && ev.button !== 0) {
            return;
        }
        const lienzo = this.lienzoRef.el;
        if (!lienzo) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const rect = lienzo.getBoundingClientRect();
        const p = this.state.posiciones[examenId] || { x: 0, y: 0 };
        this._arrastre = {
            examenId,
            pointerId: ev.pointerId,
            // desfase entre el puntero y la esquina de la tarjeta
            desfaseX: ev.clientX - rect.left - p.x,
            desfaseY: ev.clientY - rect.top - p.y,
            movido: false,
        };
        this.state.arrastrando = examenId;
        // Listeners en window: no se pierde el puntero aunque el dedo/cursor
        // salga de la tarjeta o esta se vuelva a renderizar.
        window.addEventListener("pointermove", this._onMove, { passive: false });
        window.addEventListener("pointerup", this._onUp);
        window.addEventListener("pointercancel", this._onUp);
    }

    _alMover(ev) {
        const a = this._arrastre;
        if (!a || ev.pointerId !== a.pointerId) {
            return;
        }
        ev.preventDefault();
        const rect = this.lienzoRef.el.getBoundingClientRect();
        const [x, y] = this._limitar(
            ev.clientX - rect.left - a.desfaseX,
            ev.clientY - rect.top - a.desfaseY
        );
        a.movido = true;
        this.state.posiciones[a.examenId] = { x, y };
    }

    async _alSoltar(ev) {
        const a = this._arrastre;
        if (!a || (ev.pointerId !== undefined && ev.pointerId !== a.pointerId)) {
            return;
        }
        this._quitarListenersGlobales();
        this._arrastre = null;
        this.state.arrastrando = null;
        if (!a.movido) {
            return;
        }
        const p = this.state.posiciones[a.examenId];
        // (0,0) es el centinela de "sin posición": si la tarjeta acabó justo
        // ahí, la empujamos 1px para que sí se persista.
        const x = p.x === 0 && p.y === 0 ? 1 : p.x;
        await this.orm.write("rubrica.examen", [a.examenId], {
            posicion_x: x,
            posicion_y: p.y,
        });
    }

    _quitarListenersGlobales() {
        window.removeEventListener("pointermove", this._onMove);
        window.removeEventListener("pointerup", this._onUp);
        window.removeEventListener("pointercancel", this._onUp);
    }

    // ---- callbacks del panel -----------------------------------------

    async onCriterioGuardado(examenId) {
        // Solo repreguntamos por ESTE examen, no por todo el evento.
        const criterios = await this.orm.searchRead(
            "rubrica.criterio_calificado",
            [["examen_id", "=", examenId]],
            ["valor_cualitativo", "valor_numerico"]
        );
        this.state.progreso[examenId] = criterios.filter(
            (c) => c.valor_cualitativo || c.valor_numerico
        ).length;
    }

    onResultadoCambiado(examenId, valor) {
        const item = this.rosterPorExamenId[examenId];
        if (item) {
            item.resultado = valor;
        }
    }

    onMejorExamenCambiado(examenId, valor) {
        const item = this.rosterPorExamenId[examenId];
        if (item) {
            item.mejorExamen = valor;
        }
    }
}

registry.category("actions").add("academia_examenes.tablero_calificacion", TableroCalificacion);
