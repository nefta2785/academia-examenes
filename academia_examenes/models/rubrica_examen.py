from odoo import api, fields, models


class RubricaExamen(models.Model):
    _name = 'rubrica.examen'
    _description = 'Examen de un alumno basado en una plantilla de rúbrica'
    _rec_name = 'folio'

    folio = fields.Char(string='Folio', readonly=True, copy=False, default=lambda self: 'Nuevo')
    plantilla_id = fields.Many2one(
        comodel_name='rubrica.plantilla',
        string='Plantilla',
        required=True,
    )
    alumno_id = fields.Many2one(
        comodel_name='rubrica.alumno',
        string='Alumno',
        required=True,
        ondelete='cascade',
    )
    evento_id = fields.Many2one(
        comodel_name='rubrica.evento_examen',
        string='Evento de examen',
        ondelete='restrict',
    )
    fecha_examen = fields.Date(
        string='Fecha del examen',
        required=True,
        default=fields.Date.context_today,
    )
    nivel_evaluado = fields.Char(
        string='Nivel evaluado',
        compute='_compute_nivel_evaluado',
    )
    sinodal = fields.Char(string='Sinodal')
    resultado = fields.Selection(
        selection=[
            ('aprobado', 'Aprobado'),
            ('reprobado', 'Reprobado'),
            ('pendiente', 'Pendiente'),
        ],
        string='Resultado',
        default='pendiente',
    )
    mejor_examen = fields.Boolean(string='Mejor Examen', default=False)
    calificacion_final_manual = fields.Float(string='Calificación final')
    notas_sinodal = fields.Text(string='Notas del sinodal')
    posicion_x = fields.Float(
        string='Posición X en la mesa', default=0.0, copy=False,
        help='Vista personal de la Mesa de Calificación. 0 = sin posición asignada.',
    )
    posicion_y = fields.Float(
        string='Posición Y en la mesa', default=0.0, copy=False,
        help='Vista personal de la Mesa de Calificación. 0 = sin posición asignada.',
    )
    costo_examen = fields.Float(string='Costo del examen')
    costo_sinodal = fields.Float(string='Costo del sinodal', default=0.0)
    costo_institucion = fields.Float(string='Costo de la institución', default=0.0)
    ganancia_examen = fields.Float(
        string='Ganancia',
        compute='_compute_ganancia_examen',
        store=True,
        readonly=True,
    )
    criterios_ids = fields.One2many(
        comodel_name='rubrica.criterio_calificado',
        inverse_name='examen_id',
        string='Criterios de calificación',
    )

    @api.depends('alumno_id', 'plantilla_id')
    def _compute_nivel_evaluado(self):
        for examen in self:
            nivel = self.env['rubrica.alumno_nivel'].search([
                ('alumno_id', '=', examen.alumno_id.id),
                ('plantilla_id', '=', examen.plantilla_id.id),
            ], limit=1)
            examen.nivel_evaluado = nivel.nivel_actual or False

    @api.depends('costo_examen', 'costo_sinodal', 'costo_institucion')
    def _compute_ganancia_examen(self):
        for examen in self:
            examen.ganancia_examen = examen.costo_examen - examen.costo_sinodal - examen.costo_institucion

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('folio', 'Nuevo') == 'Nuevo':
                vals['folio'] = self.env['ir.sequence'].next_by_code('rubrica.examen')
        examenes = super().create(vals_list)
        examenes._sincronizar_criterios_calificados()
        return examenes

    def write(self, vals):
        res = super().write(vals)
        # Si se reasigna la plantilla, el examen debe reflejar los criterios
        # de la nueva. Solo se AGREGAN los que falten; nunca se borra una
        # calificación ya capturada.
        if 'plantilla_id' in vals:
            self._sincronizar_criterios_calificados()
        return res

    def _sincronizar_criterios_calificados(self):
        # Crea una fila 'rubrica.criterio_calificado' por cada criterio de la
        # plantilla del examen que aún no la tenga. Es genérico: recorre
        # plantilla_id -> grupos_ids -> criterios_ids, sin ningún nombre fijo
        # de disciplina ni de criterio.
        nuevos = []
        for examen in self:
            if not examen.plantilla_id:
                continue
            ya_creados = examen.criterios_ids.criterio_plantilla_id
            for grupo in examen.plantilla_id.grupos_ids:
                for criterio in grupo.criterios_ids:
                    if criterio not in ya_creados:
                        nuevos.append({
                            'examen_id': examen.id,
                            'criterio_plantilla_id': criterio.id,
                        })
        if nuevos:
            self.env['rubrica.criterio_calificado'].create(nuevos)
