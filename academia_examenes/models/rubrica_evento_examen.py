from odoo import api, fields, models


class RubricaEventoExamen(models.Model):
    _name = 'rubrica.evento_examen'
    _description = 'Evento de examen (varios alumnos, un mismo día)'
    _order = 'fecha_evento desc, id desc'

    folio = fields.Char(
        string='Folio', readonly=True, copy=False,
        default=lambda self: 'Nuevo',
    )
    fecha_evento = fields.Date(string='Fecha del evento', required=True)
    descripcion = fields.Char(string='Descripción')
    examenes_ids = fields.One2many(
        comodel_name='rubrica.examen',
        inverse_name='evento_id',
        string='Exámenes',
    )

    @api.depends('fecha_evento')
    def _compute_display_name(self):
        # El modelo no tiene campo 'name'; sin este override Odoo mostraría
        # el texto de emergencia "rubrica.evento_examen,ID". El nombre se
        # arma solo a partir de la fecha (el usuario nunca lo escribe).
        for evento in self:
            if evento.fecha_evento:
                evento.display_name = 'Evento de examen %s' % evento.fecha_evento.strftime('%d/%m/%Y')
            else:
                evento.display_name = 'Nuevo evento de examen'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('folio', 'Nuevo') == 'Nuevo':
                vals['folio'] = self.env['ir.sequence'].next_by_code('rubrica.evento_examen')
        return super().create(vals_list)

    def action_abrir_tablero(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'academia_examenes.tablero_calificacion',
            'name': 'Tablero de Calificación - %s' % self.folio,
            'params': {
                'evento_id': self.id,
            },
        }
