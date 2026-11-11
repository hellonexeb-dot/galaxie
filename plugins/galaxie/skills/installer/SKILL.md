---
name: installer
description: Installe et configure la Galaxie pas à pas (Node.js, premier lancement, rangement des projets en galaxies et thèmes, application, icône du bureau, démarrage automatique, descriptions en français), avec l'accord de l'utilisateur à chaque étape. Reprend là où on s'était arrêté et sert aussi à réparer une installation. À utiliser quand l'utilisateur tape /galaxie:installer, vient d'installer le plugin, demande à installer ou réparer la Galaxie, ou quand Node.js manque.
---

# Installer la Galaxie, pas à pas

Tu accompagnes un débutant. Réponds en français, en tutoyant, sans jargon, en phrases courtes.

## Règles

- **Une étape à la fois.** Annonce l'étape, fais-la, dis en une ligne ce qui a changé, puis passe à la suivante.
- **Rien n'est installé ni activé sans un « oui » clair** de l'utilisateur. S'il refuse une étape facultative, passe à la suivante sans insister.
- **Les étapes déjà faites sont sautées** : c'est l'état réel de l'ordinateur (commande `--status`) qui le dit. La commande peut donc être relancée à tout moment, pour reprendre ou réparer.
- En cas d'erreur, montre le message exact, explique-le simplement et propose une solution. Ne passe pas une étape obligatoire sous silence.

## Avant de commencer

Dis en deux lignes ce qui va se passer : vérifier Node.js, ouvrir la Galaxie, ranger ses projets, en faire une application avec une icône, puis quelques réglages facultatifs. Compte environ 10 minutes.

## Étape 1 · Node.js (obligatoire)

La Galaxie a besoin de Node.js, un petit moteur qui la fait tourner sur l'ordinateur.

1. Cherche Node avec l'outil Bash :

   ```
   node --version 2>/dev/null || echo ABSENT
   ```

   Si la réponse est `ABSENT`, regarde aussi aux emplacements d'installation habituels (Node peut être installé sans que ce terminal le sache encore) :
   - Windows : `"/c/Program Files/nodejs/node.exe" --version`
   - macOS : `/opt/homebrew/bin/node --version`, puis `/usr/local/bin/node --version`

2. **Node trouvé, en version 18 ou plus** : passe à l'étape 2. Note le chemin qui a fonctionné. Dans toute la suite, il est appelé `NODE` : utilise `node` s'il a répondu directement, sinon le chemin complet entre guillemets, dans **chaque** commande.

3. **Node absent ou trop ancien** : explique-le, puis propose de l'installer.
   - **Windows** : préviens que Windows va demander « Voulez-vous autoriser cette application à apporter des modifications ? » et qu'il faut répondre **Oui**. Après accord, lance (cela peut prendre 1 à 3 minutes, prévois un long délai) :

     ```
     winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
     ```

     Ensuite, `NODE` = `"/c/Program Files/nodejs/node.exe"` (ce terminal ne connaît pas encore le nouveau Node : n'utilise pas `node` seul). Vérifie avec `"/c/Program Files/nodejs/node.exe" --version`.
     Si `winget` est introuvable ou échoue : donne le lien https://nodejs.org/fr/download, demande d'installer la version « LTS » (tout laisser par défaut), d'écrire « c'est fait », puis vérifie le chemin ci-dessus.
   - **macOS** : si `command -v brew` répond, propose `brew install node` (quelques minutes), puis `NODE` = `/opt/homebrew/bin/node` ou `/usr/local/bin/node`. Sinon, donne le lien https://nodejs.org/fr/download (fichier « macOS Installer (.pkg) », version LTS ; le Mac demandera son mot de passe), attends « c'est fait », puis `NODE` = `/usr/local/bin/node`.
   - **Linux** : donne le lien https://nodejs.org/fr/download et conseille la méthode proposée pour sa distribution (la version des dépôts est souvent trop ancienne). Attends « c'est fait », puis vérifie avec `node --version`.

## Étape 2 · L'état de l'installation

Lance :

```
NODE "${CLAUDE_PLUGIN_ROOT}/app/server.js" --status
```

La réponse (JSON) dit ce qui est déjà en place : `galaxie_lancee`, `bienvenue_validee`, `application_installee` (`null` sous Linux : impossible à vérifier, demande à l'utilisateur), `icone_bureau.etat` (`ok`, `absente` ou `a-reparer`), `demarrage_auto`, `rangement.projets_sans_theme`, `competences.sans_description`.

Montre une courte liste : ✅ fait, ⬜ à faire. Puis enchaîne sur la première étape à faire. Relance `--status` après chaque étape qui dépend de l'utilisateur.

## Étape 3 · Ouvrir la Galaxie et choisir ce qu'elle regarde (obligatoire)

Si `galaxie_lancee` est faux, lance :

```
NODE "${CLAUDE_PLUGIN_ROOT}/app/server.js"
```

Si `bienvenue_validee` est faux : explique qu'un écran de bienvenue s'est ouvert. Il demande si la Galaxie peut aussi regarder des dossiers de projets en plus de l'historique Claude. Les deux choix sont bons, rien ne quitte l'ordinateur, et tout se change plus tard dans ⚙ Réglages. Demande de cliquer sur **Explorer ma galaxie**, puis d'écrire « c'est fait ». Vérifie avec `--status`.

Une visite guidée de 4 bulles démarre ensuite dans la Galaxie : dis-le, l'utilisateur peut la suivre maintenant ou plus tard (bouton **?**).

## Étape 4 · Ranger la Galaxie (conseillé)

Si `rangement.projets_sans_theme` vaut 3 ou plus : explique qu'au départ les projets flottent un peu en vrac, et propose de les ranger ensemble maintenant (environ 3 minutes) : Claude regarde ses projets, propose des galaxies (Pro, Perso…) et des thèmes, et il valide avant que rien ne bouge. Si l'utilisateur est d'accord, utilise le skill `galaxie:ranger` (avec `NODE` dans ses commandes), puis reviens à l'étape suivante.

S'il a moins de 3 projets, saute cette étape : dis simplement qu'il pourra lancer `/galaxie:ranger` quand sa Galaxie se sera remplie.

## Étape 5 · En faire une application (conseillé)

Si `application_installee` est faux : explique qu'en l'installant comme application, la Galaxie a sa propre fenêtre et sa propre icône, comme un vrai logiciel. Il faut Chrome ou Edge.

Si l'utilisateur est d'accord : dans la Galaxie, ouvrir **⚙ Réglages**, puis cliquer sur **Installer Galaxie comme application** et confirmer **Installer**. Si ce bouton n'apparaît pas, suivre l'indication affichée à sa place : icône **Installer** à droite de la barre d'adresse. Ajoute qu'on peut ensuite l'épingler à la barre des tâches (clic droit sur son icône → **Épingler**). Attends « c'est fait », puis vérifie avec `--status`.

Cette étape doit être faite **avant** l'icône du bureau : en installant l'application, le navigateur pose sa propre icône, qui ouvre la fenêtre sans réveiller la Galaxie. L'étape suivante la répare.

## Étape 6 · L'icône du bureau (conseillé)

Si `icone_bureau.etat` n'est pas `ok`, propose de créer (ou réparer) l'icône qui ouvre la Galaxie d'un double-clic, sans passer par Claude. Après accord :

```
NODE "${CLAUDE_PLUGIN_ROOT}/app/server.js" --shortcut
```

Dis où se trouve l'icône. Sous Windows, si une icône posée par le navigateur existait, elle a été réparée (même nom, même place). Sur macOS, préviens qu'au premier double-clic il faudra peut-être autoriser `Galaxie.command` (clic droit → **Ouvrir**).

## Étape 7 · Démarrage automatique (facultatif)

Si `demarrage_auto` est faux, explique simplement : la Galaxie se lance discrètement à l'allumage de l'ordinateur, sans ouvrir de fenêtre, et consomme très peu. C'est **conseillé si l'application est épinglée à la barre des tâches** : sans ça, l'icône épinglée affiche « La Galaxie est endormie » tant qu'on ne l'a pas réveillée. Si l'utilisateur est d'accord :

```
NODE "${CLAUDE_PLUGIN_ROOT}/app/server.js" --autostart on
```

(Pour l'enlever plus tard : `--autostart off`, ou la case dans ⚙ Réglages.)

## Étape 8 · Descriptions en français (facultatif)

Si `competences.sans_description` est supérieur à 0 : propose d'écrire en français une courte description de chaque compétence qui n'en a pas (quelques minutes). Si l'utilisateur est d'accord, utilise le skill `galaxie:decrire`, puis reviens au bilan.

## Bilan

Relance `--status` une dernière fois et termine par :

- la liste ✅ de ce qui est en place, et ce qui a été sauté (on peut le faire plus tard en relançant `/galaxie:installer`) ;
- comment rouvrir la Galaxie : l'icône du bureau, l'application, ou `/galaxie:ouvrir` dans Claude Code ;
- le bouton **?** de la Galaxie pour revoir la visite guidée.
