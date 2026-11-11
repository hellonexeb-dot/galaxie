# ✦ Galaxie

**Ton univers Claude Code en 3D.** Un plugin créé par Seb pour la communauté Ottho.

Tu crées un dossier par projet et tu ouvres Claude dedans ? Au bout de quelques dizaines de projets, on s'y perd. La Galaxie les rassemble tous dans un univers que tu explores à la souris.

- **Au centre, toi.** Autour, tes galaxies.
- **Tes galaxies de projets** : une par grand domaine de ta vie (Pro, Perso, Formation…). Dans chacune, chaque soleil est un thème (un client, une activité), chaque planète un projet, chaque lune une conversation avec Claude.
- **La galaxie Compétences** : tes skills, plugins, serveurs MCP et connecteurs, chacun avec une description en français, ce qu'il fait, quand t'en servir et un exemple de phrase à dire à Claude.

**Pas besoin de tout ranger toi-même** : Claude regarde tes projets, te propose des galaxies et des thèmes, et range tout dès que tu es d'accord (`/galaxie:ranger`). Tu peux ensuite tout renommer et déplacer d'un clic.

Depuis la fiche d'un projet :

- **Nouvelle conversation** dans le bon dossier, au choix dans Claude Code (terminal) ou dans Claude Desktop ;
- **Reprendre** une ancienne conversation là où tu l'avais laissée ;
- statut (idée, en cours, en pause, livré, archivé), note, adresse du site, ouverture du dossier.

La Galaxie s'ouvre **dans sa propre fenêtre**, avec son icône, comme une application (avec Edge, Chrome ou Brave ; sinon dans un onglet de ton navigateur). Tu peux aussi l'**installer** depuis le menu de Chrome ou d'Edge (« Installer Galaxie ») pour la retrouver dans ton menu Démarrer ou ton Launchpad.

Et aussi : une recherche qui fouille les projets, les titres de conversations et les descriptions des compétences, et la création d'un nouveau projet (dossier et Claude lancé dedans) en un clic.

## Ce qu'il te faut

- **Claude Code**
- **Node.js** 18 ou plus récent. Pas de panique si tu ne l'as pas : `/galaxie:installer` te propose de l'installer.
- Windows, macOS ou Linux, avec un navigateur récent (Chrome ou Edge conseillés, pour l'avoir en application).

## Installation

Dans Claude Code, tape :

```
/plugin marketplace add hellonexeb-dot/galaxie
/plugin install galaxie@galaxie
```

Puis redémarre Claude Code et tape :

```
/galaxie:installer
```

Claude t'accompagne pas à pas, en te demandant ton accord à chaque étape : Node.js si besoin, premier lancement, rangement de tes projets en galaxies et en thèmes, application avec sa fenêtre, icône sur le bureau, démarrage automatique et descriptions en français. Tu peux relancer cette commande à tout moment, pour reprendre ou réparer.

## Utilisation

| Commande | Ce qu'elle fait |
|---|---|
| `/galaxie:installer` | Installe et configure la Galaxie pas à pas (ou la répare) |
| `/galaxie:ouvrir` | Ouvre la Galaxie |
| `/galaxie:ranger` | Claude regarde tes projets et te propose des galaxies (Pro, Perso…) et des thèmes ; il range tout après ton accord |
| `/galaxie:raccourci` | Crée (ou répare) l'icône « Galaxie » du bureau, pour l'ouvrir sans passer par Claude |
| `/galaxie:decrire` | Claude écrit en français la description de chacune de tes compétences |

Dans la Galaxie :

- **clic** sur un astre ou sur son nom : on s'en approche ;
- **glisser** : tourner autour ; **molette** : zoomer vers le pointeur ;
- **Échap** ou **← Retour** : remonter d'un niveau ; **R** ou **◎ Recentrer** : remettre la vue en place ;
- **Ctrl+K** ou **/** : rechercher ;
- **?** : revoir la visite guidée. Ordinateur un peu lent ? Coche « Mode PC modeste » dans ⚙ Réglages.

## Tes données restent chez toi

La Galaxie tourne **uniquement sur ton ordinateur**, à l'adresse `http://127.0.0.1:4747`. Elle n'est pas accessible depuis internet et **n'envoie rien nulle part**, même pas pour charger le moteur 3D ou les polices, qui sont inclus dans le plugin.

### Ce qu'elle lit

Elle ne parcourt pas ton disque. Elle lit des endroits précis, toujours les mêmes :

| Où | Pourquoi | Ce qu'elle en garde |
|---|---|---|
| `~/.claude/projects` (historique de Claude Code) | Trouver tes projets et tes conversations | Le dossier de chaque conversation, son titre (ou le début du premier message), sa date |
| `~/.claude/skills` | Tes skills | Leur nom et leur description |
| `~/.claude/plugins`, `~/.claude/settings.json` | Tes plugins | Leur nom, leur version, leur description, la liste de leurs skills et commandes, activé ou non |
| `~/.claude.json` | Tes serveurs MCP et tes connecteurs | **Seulement** le nom et l'adresse de chaque serveur. Ce fichier peut contenir des clés d'API : la Galaxie ne les garde pas, ne les affiche pas et ne les transmet jamais |
| Les dossiers que **tu** choisis *(facultatif)* | Repérer les projets où tu n'as pas encore utilisé Claude | Le **nom** et la date de leurs sous-dossiers, jamais leur contenu |

Au premier lancement, la Galaxie te demande si elle peut regarder dans des dossiers. **Par défaut, c'est non** : elle se contente de ton historique Claude Code. Tu peux changer d'avis à tout moment dans ⚙ Réglages.

### Ce qu'elle écrit

- Dans son propre dossier `~/.galaxie` : tes thèmes, statuts, notes et descriptions.
- **Seulement si tu le demandes** : l'icône « Galaxie » du bureau, et un raccourci de démarrage automatique (dans le dossier « Démarrage » de Windows, les `LaunchAgents` de macOS ou l'`autostart` de Linux).
- Elle ne modifie jamais `~/.claude` ni tes projets.
- « Retirer une planète » ne fait que la masquer : ton dossier n'est jamais supprimé.
- Le bouton « + Projet » crée un dossier vide, à l'endroit que tu as choisi.

## Désinstaller

D'abord, si tu l'avais activé, décoche « Lancer la Galaxie au démarrage de l'ordinateur » dans ⚙ Réglages. Puis :

```
/plugin uninstall galaxie@galaxie
```

Tu peux ensuite supprimer le dossier `~/.galaxie` et l'icône du bureau.

## Licence

MIT. Le moteur 3D [three.js](https://threejs.org) est inclus sous sa propre licence MIT (`plugins/galaxie/app/public/vendor/three/LICENSE`).
