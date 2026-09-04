from odoo import fields, models


class RubricaCriterioCalificado(models.Model):
    _name = 'rubrica.criterio_calificado'
    _description = 'Calificación de un criterio dentro de un examen'

    examen_id = fields.Many2one(
        comodel_name='rubrica.examen',
        string='Examen',
        required=True,
        ondelete='cascade',
    )
    criterio_plantilla_id = fields.Many2one(
        comodel_name='rubrica.criterio_plantilla',
        string='Criterio',
        required=True,
    )
    valor_cualitativo = fields.Char(string='Valor cualitativo')
    valor_numerico = fields.Float(string='Valor numérico')
    comentario = fields.Text(string='Comentario')
