---
name: raccourci
description: Crée une icône « Galaxie » sur le bureau (Windows, macOS ou Linux) pour ouvrir la Galaxie d'un double-clic, sans passer par Claude Code. À utiliser quand l'utilisateur tape /galaxie:raccourci ou demande un raccourci ou une icône pour la Galaxie.
---

# Créer le raccourci de la Galaxie

1. Avec l'outil Bash, lance :

   ```
   node "${CLAUDE_PLUGIN_ROOT}/app/server.js" --shortcut
   ```

2. La commande affiche l'emplacement du raccourci créé. Explique à l'utilisateur, en français et en deux ou trois lignes :
   - où se trouve l'icône (« Galaxie » sur le bureau) ;
   - qu'un double-clic ouvre la Galaxie dans le navigateur ;
   - que le raccourci suivra les mises à jour du plugin, sans avoir à le recréer ;
   - sous Windows, si la Galaxie était déjà installée comme application, son icône du bureau a été réparée (même nom, même place) : avant, elle affichait « La Galaxie est endormie ». Si l'utilisateur l'a aussi épinglée à la barre des tâches, conseille d'activer « Lancer la Galaxie au démarrage de l'ordinateur » dans ⚙ Réglages, car l'icône épinglée ne peut pas réveiller la Galaxie toute seule.

3. Sur macOS, précise qu'au premier double-clic, macOS peut demander d'autoriser le fichier `Galaxie.command` (clic droit → Ouvrir).

En cas d'erreur, montre le message exact et propose de l'examiner.
