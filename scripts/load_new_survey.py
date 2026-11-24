import csv
import json
import re

# Complete mapping from email to Codizulca seller
email_to_seller = {
    'jh3590055@gmail.com': 'JUAN HERNANDEZ',
    'sarahreyesrosales@gmail.com': 'SARAH REYES',
    'mariabricenosala@gmail.com': 'MARIA BRICEÑO',
    'moremelcobranza@gmail.com': 'ANGELICA MORENO',
    'cobranzaslauyleo05@gmail.com': 'LEONARDO RIOS',
    'hernandj81@gmail.com': 'HERNAN PAZ',
    'maryerygarcia29@gmail.com': 'MARYERY GARCIA',
    'carlos.fuenmayorrp@gmail.com': 'CARLOS FUENMAYOR',
    'oscardortizh06@gmail.com': 'OSCAR ORTIZ - CORO',
    'lugoyoleida00@gmail.com': 'YOLEIDA LUGO',
    'marianachacinrosas@gmail.com': 'CUENTAS CLAVE 1 - MC (MARIANA CHACIN)',
    'luisgustavo127@gmail.com': 'VICTORIA VARGAS',
    'sairuvalles92@gmail.com': 'CUENTAS CLAVE 2 - SV (SAIRU VALLES)',
    'johnatansoto18@gmail.com': 'JOHNATAN SOTO VILLA DEL ROS',
    'paab937@gmail.com': 'PEDRO ABREU',
    'adeljaraba0704@gmail.com': 'ADEL JARABA',
    'elchupax@gmail.com': 'PEDRO ABREU',
    'epina3343@gmail.com': 'EDUARDO PIÑA',
    'araujojuanpabla@gmail.com': 'J PABLO ARAUJO',
    'josegregorio161177@gmail.com': 'JOSE G. GONZALEZ',
    'solerelisab@gmail.com': 'ELISA SOLER',
    'oswaldochurioncodizulca@gmail.com': 'OSCAR ORTIZ - LA COSTA',
    'josegonzalez@codizulca.com': 'JOSE G. GONZALEZ',
    'luisammv.1990@gmail.com': 'VICTORIA VARGAS'
}

print("Script template written")
