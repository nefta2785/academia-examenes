import { Component, onWillStart, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class PanelCalificacion extends Component {
    static template = "academia_examenes.PanelCalificacion";
    static props = {
        examenId: Number,
        onGuardado: Function,
        onResultadoCambiado: Function,
        onMejorExamenCambiado: Function,
    };

    setup() {
        this.orm = useService("orm");

        this.state = useState({
            cargando: true,
            alumno: { name: "", foto: false },
            nivelEvaluado: "",
            disciplina: "",
            usaMejorExamen: false,
            opcionesResultado: [],
            grupos: [],
            resultado: "pendiente",
            mejorExamen: false,
            calificacionFinalManual: "",
            notasSinodal: "",
            mensajeGuardado: false,
        });

        onWillStart(async () => {
            await this.cargar();
        });
    }

    async cargar() {
        const examenId = this.props.examenId;

        const [examen] = await this.orm.read(
            "rubrica.examen",
            [examenId],
            [
                "alumno_id", "plantilla_id", "nivel_evaluado", "resultado",
                "mejor_examen", "calificacion_final_manual", "notas_sinodal",
                "criterios_ids",
            ]
        );

        const [alumno] = await this.orm.read(
            "rubrica.alumno", [examen.alumno_id[0]], ["name", "foto"]
        );

        const [plantilla] = await this.orm.read(
            "rubrica.plantilla",
            [examen.plantilla_id[0]],
            ["disciplina", "usa_mejor_examen", "grupos_ids"]
        );

        // Grupos de la plantilla, ordenados por su campo 'orden'.
        const grupos = await this.orm.read(
            "rubrica.grupo", plantilla.grupos_ids, ["nombre", "orden", "criterios_ids"]
        );
        grupos.sort((a, b) => a.orden - b.orden);

        // Todos los criterios de todos los grupos: UNA sola llamada.
        const criterioIds = grupos.flatMap((g) => g.criterios_ids);
        const criteriosPlantilla = criterioIds.length
            ? await this.orm.read(
                  "rubrica.criterio_plantilla",
                  criterioIds,
                  [
                      "nombre", "tipo_escala", "escala_min", "escala_max",
                      "escala_incremento", "opciones_cualitativas", "permite_comentario",
                  ]
              )
            : [];
        const criterioPorId = Object.fromEntries(criteriosPlantilla.map((c) => [c.id, c]));

        // Filas de calificación ya existentes (creadas al crear el examen).
        const calificados = examen.criterios_ids.length
            ? await this.orm.read(
                  "rubrica.criterio_calificado",
                  examen.criterios_ids,
                  ["criterio_plantilla_id", "valor_cualitativo", "valor_numerico", "comentario"]
              )
            : [];
        const calificadoPorCriterio = Object.fromEntries(
            calificados.map((c) => [c.criterio_plantilla_id[0], c])
        );

        // orm.read trae la clave cruda de un Selection, no su etiqueta.
        const campos = await this.orm.call("rubrica.examen", "fields_get", [], {
            allfields: ["resultado"],
            attributes: ["selection"],
        });

        this.state.alumno = alumno;
        this.state.nivelEvaluado = examen.nivel_evaluado || "";
        this.state.disciplina = plantilla.disciplina;
        this.state.usaMejorExamen = plantilla.usa_mejor_examen;
        this.state.resultado = examen.resultado;
        this.state.mejorExamen = examen.mejor_examen;
        this.state.calificacionFinalManual =
            examen.calificacion_final_manual || examen.calificacion_final_manual === 0
                ? examen.calificacion_final_manual
                : "";
        this.state.notasSinodal = examen.notas_sinodal || "";
        this.state.opcionesResultado = campos.resultado.selection.map(
            ([valor, etiqueta]) => ({ valor, etiqueta })
        );

        this.state.grupos = grupos.map((grupo) => ({
            id: grupo.id,
            nombre: grupo.nombre,
            criterios: grupo.criterios_ids
                .map((cid) => {
                    const cp = criterioPorId[cid];
                    if (!cp) {
                        return null;
                    }
                    const fila = calificadoPorCriterio[cid];
                    return {
                        calificadoId: fila ? fila.id : false,
                        criterioPlantillaId: cid,
                        nombre: cp.nombre,
                        tipoEscala: cp.tipo_escala,
                        escalaMin: cp.escala_min,
                        escalaMax: cp.escala_max,
                        escalaIncremento: cp.escala_incremento,
                        opciones: this.parsearOpciones(cp.opciones_cualitativas),
                        permiteComentario: cp.permite_comentario,
                        valorCualitativo: fila && fila.valor_cualitativo ? fila.valor_cualitativo : "",
                        valorNumerico:
                            fila && (fila.valor_numerico || fila.valor_numerico === 0)
                                ? fila.valor_numerico
                                : "",
                        comentario: fila && fila.comentario ? fila.comentario : "",
                    };
                })
                .filter((c) => c !== null),
        }));

        this.state.cargando = false;
    }

    parsearOpciones(texto) {
        // "E, MB, B, R" -> ["E", "MB", "B", "R"]. El número de opciones es
        // el que la plantilla defina: no se asume ninguno.
        if (!texto) {
            return [];
        }
        return texto.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
    }

    mostrarConfirmacionGuardado() {
        clearTimeout(this.guardadoTimer);
        this.state.mensajeGuardado = true;
        this.guardadoTimer = setTimeout(() => {
            this.state.mensajeGuardado = false;
        }, 1800);
    }

    async _persistirCriterio(criterio, vals) {
        // Normalmente la fila ya existe (se crea junto con el examen); si
        // faltara -criterio añadido a la plantilla después- se crea aquí.
        if (criterio.calificadoId) {
            await this.orm.write("rubrica.criterio_calificado", [criterio.calificadoId], vals);
        } else {
            const ids = await this.orm.create("rubrica.criterio_calificado", [{
                examen_id: this.props.examenId,
                criterio_plantilla_id: criterio.criterioPlantillaId,
                ...vals,
            }]);
            criterio.calificadoId = ids[0];
        }
        this.mostrarConfirmacionGuardado();
        this.props.onGuardado(this.props.examenId);
    }

    async calificarCualitativo(criterio, opcion) {
        criterio.valorCualitativo = opcion;
        await this._persistirCriterio(criterio, { valor_cualitativo: opcion });
    }

    async calificarNumerico(criterio) {
        const raw = criterio.valorNumerico;
        const valor = raw === "" || raw === null || raw === undefined ? 0 : parseFloat(raw);
        await this._persistirCriterio(criterio, { valor_numerico: valor });
    }

    async guardarComentario(criterio) {
        await this._persistirCriterio(criterio, { comentario: criterio.comentario || "" });
    }

    async marcarResultado(valor) {
        this.state.resultado = valor;
        await this.orm.write("rubrica.examen", [this.props.examenId], { resultado: valor });
        this.mostrarConfirmacionGuardado();
        this.props.onResultadoCambiado(this.props.examenId, valor);
    }

    async alternarMejorExamen() {
        const valor = !this.state.mejorExamen;
        this.state.mejorExamen = valor;
        await this.orm.write("rubrica.examen", [this.props.examenId], { mejor_examen: valor });
        this.mostrarConfirmacionGuardado();
        this.props.onMejorExamenCambiado(this.props.examenId, valor);
    }

    async guardarCalificacionFinal() {
        const raw = this.state.calificacionFinalManual;
        const valor = raw === "" || raw === null || raw === undefined ? 0 : parseFloat(raw);
        await this.orm.write("rubrica.examen", [this.props.examenId], {
            calificacion_final_manual: valor,
        });
        this.mostrarConfirmacionGuardado();
    }

    async guardarNotasSinodal() {
        await this.orm.write("rubrica.examen", [this.props.examenId], {
            notas_sinodal: this.state.notasSinodal || "",
        });
        this.mostrarConfirmacionGuardado();
    }
}
