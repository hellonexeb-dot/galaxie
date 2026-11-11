# Outils de fabrication

Scripts utilisés pour construire le plugin. Ils ne font pas partie du plugin installé chez les utilisateurs.

| Script | À quoi il sert | Comment le lancer |
|---|---|---|
| `dessiner-icone.ps1` | Dessine l'icône (soleil, orbite, planète) en PNG 512, 256, 192, 48, 32, 16 px. Windows uniquement (System.Drawing). | `powershell -File outils/dessiner-icone.ps1 -OutDir plugins/galaxie/app/public/icons` |
| `assembler-ico.js` | Assemble `icon.ico` (pour les raccourcis Windows) à partir des PNG, puis supprime les petites tailles devenues inutiles. À lancer juste après le script précédent. | `node outils/assembler-ico.js plugins/galaxie/app/public/icons` |
| `integrer-threejs.js` | Copie three.js et les seuls modules utilisés (avec leurs dépendances) dans `vendor/`. Pour changer de version : `npm pack three@<version>`, décompresser, puis lancer le script. | `node outils/integrer-threejs.js <dossier package de three> plugins/galaxie/app/public/vendor/three` |
| `tester-selecteur-dossier.js` | Vérifie que la fenêtre « Choisir un dossier » s'affiche bien à l'écran sous Windows (elle était invisible avant correction). Elle apparaît quelques secondes puis se ferme. | `node outils/tester-selecteur-dossier.js plugins/galaxie/app/server.js` |

Les polices (Instrument Serif, Inter) viennent des paquets npm `@fontsource/instrument-serif` et `@fontsource/inter` (fichiers `latin-*.woff2`, licence SIL OFL).
