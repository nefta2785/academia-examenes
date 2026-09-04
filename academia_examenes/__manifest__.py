{
    'name': 'Academia Exámenes',
    'version': '1.0',
    'depends': ['base', 'web'],
    'summary': 'Motor genérico de rúbricas de examen para academias de artes marciales',
    'data': [
        'security/academia_examenes_groups.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'views/rubrica_plantilla_views.xml',
        'views/rubrica_alumno_views.xml',
        'views/rubrica_examen_views.xml',
        'views/rubrica_evento_examen_views.xml',
        'views/menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'academia_examenes/static/src/js/panel_calificacion.js',
            'academia_examenes/static/src/js/tablero_calificacion.js',
            'academia_examenes/static/src/xml/panel_calificacion.xml',
            'academia_examenes/static/src/xml/tablero_calificacion.xml',
        ],
    },
    'installable': True,
    'application': True,
}
