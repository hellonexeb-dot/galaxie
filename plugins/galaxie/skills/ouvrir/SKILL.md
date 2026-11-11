---
name: ouvrir
description: Ouvre la Galaxie dans le navigateur, l'univers 3D des projets Claude Code (planètes), des conversations (lunes) et des compétences installées (skills, plugins, MCP, connecteurs). À utiliser quand l'utilisateur tape /galaxie:ouvrir ou demande d'ouvrir sa galaxie, de voir tous ses projets ou de retrouver un ancien projet.
---

# Ouvrir la Galaxie

1. Lance le serveur local avec l'outil Bash (il se détache tout seul et ouvre le navigateur) :

   ```
   node "${CLAUDE_PLUGIN_ROOT}/app/server.js"
   ```

2. Selon le résultat :
   - **« Galaxie ouverte sur http://127.0.0.1:4747/ »** : dis à l'utilisateur que la Galaxie s'ouvre dans sa propre fenêtre, et donne l'adresse au cas où elle ne s'ouvrirait pas.
   - **`node` introuvable** : explique que la Galaxie a besoin de Node.js. Indique de télécharger la version « LTS » sur https://nodejs.org, de l'installer, puis de fermer et rouvrir Claude Code avant de relancer `/galaxie:ouvrir`.
   - **Autre erreur** : montre le message exact et propose de l'examiner.

3. Termine par deux conseils, en une ligne chacun :
   - `/galaxie:raccourci` crée une icône sur le bureau pour ouvrir la Galaxie sans passer par Claude.
   - `/galaxie:decrire` écrit en français la description de chaque compétence installée.

Réponds en français, en quelques lignes, sans jargon.
