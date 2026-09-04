#!/bin/bash
#
# Script de arranque para academia_examenes, proyecto nuevo e independiente.

source /Users/neftaliduran/odoo/gym-odoo/venv/bin/activate

python /Users/neftaliduran/odoo/gym-odoo/odoo/odoo-bin \
  -d academia_examenes -i academia_examenes \
  --addons-path=/Users/neftaliduran/odoo/academia-examenes-odoo,/Users/neftaliduran/odoo/gym-odoo/odoo/addons,/Users/neftaliduran/odoo/gym-odoo/odoo/odoo/addons \
  --without-demo=all --http-port=8072
