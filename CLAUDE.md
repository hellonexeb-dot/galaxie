# Galaxie — guide pour Claude

Plugin Claude Code qui affiche l'univers de l'utilisateur en 3D dans le navigateur : galaxie **Projets** (soleil = thème, planète = projet, lune = conversation Claude) et galaxie **Compétences** (skills, plugins, MCP, connecteurs). Public visé : élèves francophones débutants de la communauté Ottho. **Tout le texte visible est en français, tutoiement, sans jargon.**

## Structure

```
.claude-plugin/marketplace.json     marketplace « galaxie »
plugins/galaxie/
  .claude-plugin/plugin.json        manifeste (auteur Seb, version)
  skills/ouvrir|decrire|raccourci/  les commandes /galaxie:*
  app/server.js                     serveur Node sans dépendance (Windows, macOS, Linux)
  app/catalogue.json                descriptions françaises génériques des compétences courantes
  app/public/                       page 3D (three.js), service worker, page « endormie »
  app/public/vendor/                three.js et polices intégrés : aucune requête internet
```

## Règles du projet

- **Rien ne sort de la machine.** Aucun CDN, aucune requête externe, aucun envoi de données. Le serveur n'écoute que `127.0.0.1`.
- **Lecture seule sur `~/.claude`.** La Galaxie n'écrit que dans `~/.galaxie` (configuration, descriptions, lanceur, icônes).
- **Jamais de secret affiché** : pour les serveurs MCP, seulement le nom et l'hôte (`safeTarget`).
- **Aucun dossier exploré sans accord** : `scanRoots` est vide tant que l'écran de bienvenue n'a pas été validé.
- Les requêtes POST exigent l'en-tête `X-Galaxie: 1` (protection contre les autres sites) et l'hôte doit être `127.0.0.1` ou `localhost` (DNS rebinding).
- Aucune donnée personnelle dans les fichiers publiés : vérifier avec une recherche avant chaque publication.

## Tester

```
# tests de la lecture des conversations (titres, compétences utilisées, rangement par projet)
npm test

# valider le plugin et la marketplace
claude plugin validate .

# lancer une instance de test isolée (profil vierge, autre port)
GALAXIE_PORT=4848 GALAXIE_HOME=/tmp/galaxie-test node plugins/galaxie/app/server.js --foreground --no-open

# autres modes du serveur
node plugins/galaxie/app/server.js --list-caps [--missing]   # utilisé par /galaxie:decrire
node plugins/galaxie/app/server.js --shortcut                # utilisé par /galaxie:raccourci
```

Les tests (`tests/`) chargent `server.js` comme module : il exporte alors ses fonctions de lecture sans démarrer (`require.main !== module`). Ils travaillent dans un dossier temporaire avec de fausses conversations ; si Claude Code change le format de ses `.jsonl`, c'est là qu'il faut ajouter un cas.

Préférences propres au navigateur (dans `localStorage`, pas dans `~/.galaxie`) : `galaxie-visite-vue` (visite guidée déjà vue, le bouton « ? » la relance) et `galaxie-pc-modeste` (rendu allégé : pas de lueur, résolution 1, 30 images/s).

Pour tester sans toucher au vrai profil : `GALAXIE_HOME` pour les données, `USERPROFILE`/`HOME` pour le bureau, `APPDATA` pour le démarrage automatique sous Windows.

Après une modification de `server.js`, relancer le serveur sur 4747 (arrêter le processus `node` qui écoute sur ce port, puis `node plugins/galaxie/app/server.js --no-open`).

## Rangement des conversations

Une conversation est affichée sur la planète du projet où elle a fait **le plus d'actions** (comptage des champs `cwd` du fichier `.jsonl`, rattachés au projet connu le plus proche), et non forcément là où elle a commencé. Les dossiers qui n'existent plus ne comptent pas. Le dossier de départ est conservé (`origin`) : « Reprendre » lance `claude --resume` depuis ce dossier, seul endroit d'où Claude Code retrouve la conversation. Les fichiers de Claude ne sont jamais déplacés ni modifiés.

## Galaxies et liens (inspirés du graphe d'Obsidian)

- **Domaines** : `config.domains` = galaxies de projets (Pro, Perso…), au moins une (« Projets » par défaut, `ensureDomains`). Chaque thème a un `domain`. Les planètes errantes vont dans la première galaxie. `placeGalaxies()` les dispose en cercle autour de « Toi » (compétences à droite).
- **Liens projet ↔ compétence** : `sessionUses()` ne retient que des **noms** issus des vrais appels (`"type":"tool_use"` Skill et `mcp__…`) et des commandes tapées (`<command-name>`). Les listes d'outils disponibles (`surfacedDefinitions`) ne comptent pas, sinon chaque conversation semble utiliser tous les connecteurs. `resolveUses()` relie `plugin:skill`, `mcp__plugin_<plugin>_…`, `mcp__claude_ai_<Connecteur>__…` et `mcp__<serveur>__…` aux compétences installées ; `n` = nombre de conversations.
- Les liens ne sont montrés **que dans les fiches** (« Compétences utilisées », « Utilisée dans ») et les infobulles. Des fils 3D entre galaxies ont été essayés puis retirés à la demande de Seb : ils encombraient la vue sans rien apprendre de plus. Ne pas les remettre.

## Points délicats déjà rencontrés

- **Encodage** : ne jamais réécrire un fichier avec `Get-Content`/`Set-Content` de PowerShell 5 (accents cassés, BOM ajouté). Utiliser l'outil d'édition.

- **Sélecteur de dossier Windows** : lancé par un PowerShell caché, il héritait de l'ordre « caché ». On affiche d'abord une fenêtre transparente au premier plan qui sert de parent. Une seule fenêtre à la fois (`pickPending`).
- **Pas de `.vbs`** : Windows Defender bloque comme « logiciel potentiellement indésirable » un VBScript qui lance un programme caché. Le raccourci du bureau et le démarrage automatique sont des `.lnk` qui lancent directement `node lancer.js`, fenêtre réduite (`winShortcut`).
- **Icône posée par Chrome** : en installant l'application, Chrome met sur le bureau une icône qui ouvre la fenêtre sans démarrer le serveur (page « endormie »). `--shortcut` la fait passer par le lanceur, en gardant son nom et sa place. L'icône épinglée à la barre des tâches, elle, ne peut pas être convertie : il faut le démarrage automatique.
- **Le lanceur démarre la copie installée du plugin** (`~/.claude/plugins/cache/…`), pas le dossier de développement. Pour essayer une modification depuis l'icône : augmenter la version dans `plugin.json`, puis `claude plugin marketplace update galaxie` et `claude plugin update galaxie@galaxie`.
- **Liens `claude://`** : à ouvrir avec `rundll32 url.dll,FileProtocolHandler` sous Windows ; `explorer.exe` les prend pour un dossier.
- **Application installée** : Chrome crée un raccourci `.lnk` avec `--app-id` dans un sous-dossier du menu Démarrer dont le nom dépend de la langue (« Applications Chrome »). Edge n'en crée pas de détectable : Chrome passe donc en priorité.
- **Éclairage 3D** : l'utilisateur ne veut ni planètes lumineuses ni soleils éblouissants. Planètes réalistes (textures procédurales), seuil de bloom élevé.
