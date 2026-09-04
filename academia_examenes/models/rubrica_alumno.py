from odoo import api, fields, models


class RubricaAlumno(models.Model):
    _name = 'rubrica.alumno'
    _description = 'Alumno de la academia'

    name = fields.Char(string='Nombre completo', required=True)
    foto = fields.Image(string='Foto', max_width=1024, max_height=1024)
    fecha_nacimiento = fields.Date(string='Fecha de nacimiento')
    edad = fields.Integer(compute='_compute_edad', string='Edad')
    nivel_ids = fields.One2many(
        comodel_name='rubrica.alumno_nivel',
        inverse_name='alumno_id',
        string='Niveles por disciplina',
    )

    @api.depends('fecha_nacimiento')
    def _compute_edad(self):
        hoy = fields.Date.context_today(self)
        for alumno in self:
            if not alumno.fecha_nacimiento:
                alumno.edad = 0
                continue
            nacimiento = alumno.fecha_nacimiento
            cumplio_este_anio = (hoy.month, hoy.day) >= (nacimiento.month, nacimiento.day)
            alumno.edad = hoy.year - nacimiento.year - (0 if cumplio_este_anio else 1)
