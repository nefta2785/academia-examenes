from odoo import fields, models


class RubricaCriterioPlantilla(models.Model):
    _name = 'rubrica.criterio_plantilla'
    _description = 'Criterio evaluable dentro de un grupo de una plantilla de rúbrica'
    _rec_name = 'nombre'

    grupo_id = fields.Many2one(
        comodel_name='rubrica.grupo',
        string='Grupo',
        required=True,
        ondelete='cascade',
    )
    nombre = fields.Char(string='Nombre', required=True)
    tipo_escala = fields.Selection(
        selection=[
            ('cualitativa', 'Cualitativa'),
            ('numerica', 'Numérica'),
        ],
        string='Tipo de escala',
        required=True,
    )
    escala_min = fields.Float(
        string='Escala mínima',
        help='Solo aplica cuando el tipo de escala es Numérica.',
    )
    escala_max = fields.Float(
        string='Escala máxima',
        help='Solo aplica cuando el tipo de escala es Numérica.',
    )
    escala_incremento = fields.Float(
        string='Incremento de escala',
        help='Solo aplica cuando el tipo de escala es Numérica.',
    )
    opciones_cualitativas = fields.Char(
        string='Opciones cualitativas',
        help=(
            'Lista de opciones separadas por comas, ej. "E,MB,B,R". '
            'El número de opciones es variable, no está fijo a 4. '
            'Solo aplica cuando el tipo de escala es Cualitativa.'
        ),
    )
    permite_comentario = fields.Boolean(string='Permite comentario', default=True)
