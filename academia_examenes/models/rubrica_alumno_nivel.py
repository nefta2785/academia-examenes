from odoo import fields, models


class RubricaAlumnoNivel(models.Model):
    _name = 'rubrica.alumno_nivel'
    _description = 'Nivel actual de un alumno en la disciplina de una plantilla'

    alumno_id = fields.Many2one(
        comodel_name='rubrica.alumno',
        string='Alumno',
        required=True,
        ondelete='cascade',
    )
    plantilla_id = fields.Many2one(
        comodel_name='rubrica.plantilla',
        string='Plantilla',
        required=True,
        ondelete='restrict',
    )
    nivel_actual = fields.Char(string='Nivel actual')

    _alumno_plantilla_unique = models.Constraint(
        'unique (alumno_id, plantilla_id)',
        'Este alumno ya tiene un nivel registrado para esta plantilla.',
    )
