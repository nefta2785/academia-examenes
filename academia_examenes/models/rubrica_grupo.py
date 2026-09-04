from odoo import fields, models


class RubricaGrupo(models.Model):
    _name = 'rubrica.grupo'
    _description = 'Grupo de evaluación de una plantilla de rúbrica'
    _order = 'orden, id'

    plantilla_id = fields.Many2one(
        comodel_name='rubrica.plantilla',
        string='Plantilla',
        required=True,
        ondelete='cascade',
    )
    nombre = fields.Char(string='Nombre', required=True)
    orden = fields.Integer(
        string='Orden',
        default=10,
        help='Determina el orden en que se despliega este grupo en pantalla.',
    )
    criterios_ids = fields.One2many(
        comodel_name='rubrica.criterio_plantilla',
        inverse_name='grupo_id',
        string='Criterios',
    )
