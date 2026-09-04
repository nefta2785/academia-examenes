from odoo import fields, models


class RubricaPlantilla(models.Model):
    _name = 'rubrica.plantilla'
    _description = 'Plantilla de rúbrica de examen'
    _rec_name = 'disciplina'

    disciplina = fields.Char(string='Disciplina', required=True)
    activa = fields.Boolean(string='Activa', default=True)
    usa_mejor_examen = fields.Boolean(
        string='Usa "Mejor Examen"',
        default=False,
        help='Indica si esta disciplina otorga el badge de "Mejor Examen" en eventos grupales.',
    )
    grupos_ids = fields.One2many(
        comodel_name='rubrica.grupo',
        inverse_name='plantilla_id',
        string='Grupos de evaluación',
    )
