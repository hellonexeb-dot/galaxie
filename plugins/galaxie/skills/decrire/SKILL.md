---
name: decrire
description: Écrit en français, pour un public débutant, la description de chaque compétence installée (skills, plugins, serveurs MCP, connecteurs) affichée dans la Galaxie. À utiliser quand l'utilisateur tape /galaxie:decrire ou demande de décrire ou d'expliquer ses compétences dans la Galaxie.
argument-hint: "[tout]"
---

# Décrire les compétences de la Galaxie

Arguments reçus : `$ARGUMENTS`

## 1. Lister les compétences à décrire

Avec l'outil Bash, lance :

```
node "${CLAUDE_PLUGIN_ROOT}/app/server.js" --list-caps --missing
```

Si l'argument contient « tout », retire `--missing` pour réécrire toutes les descriptions.

Le résultat est un JSON avec :
- `fichier_descriptions` : le fichier où enregistrer les descriptions ;
- `competences` : pour chaque compétence, sa clé (`key`), sa famille, son nom, sa description d'origine (souvent en anglais), un détail (adresse d'un serveur MCP, source d'un plugin) et son contenu (skills et commandes d'un plugin).

Si la liste est vide, dis que toutes les compétences ont déjà une description, et arrête-toi là.

## 2. Écrire les descriptions

Pour chaque compétence, écris trois textes en français :

- `resume` : ce que c'est, en une phrase claire (25 mots maximum), sans jargon technique.
- `quand` : dans quelle situation concrète s'en servir (une phrase).
- `exemple` : une phrase que l'utilisateur pourrait dire à Claude pour s'en servir, ou la commande à taper (`/nom`). Laisse vide (`""`) si la compétence fonctionne toute seule, sans qu'on la demande.

Règles :
- Le public est francophone et débutant : tutoie, reste concret, évite les anglicismes quand un mot français existe.
- Base-toi d'abord sur la description d'origine et le contenu. Pour un serveur MCP ou un connecteur sans description, appuie-toi sur ce que tu sais du service et sur son adresse.
- Si tu ne sais vraiment pas à quoi sert une compétence, dis-le franchement dans `resume` (« Rôle inconnu : … ») plutôt que d'inventer.
- N'écris jamais de clé d'API, de jeton ou d'information personnelle dans les descriptions.

## 3. Enregistrer

Lis le fichier `fichier_descriptions` s'il existe déjà (c'est un objet JSON). Ajoute ou remplace uniquement les clés que tu viens d'écrire, et garde toutes les autres telles quelles. Le format est :

```json
{
  "skill:humanizer": { "resume": "…", "quand": "…", "exemple": "…" }
}
```

Écris le fichier en JSON valide, encodé en UTF-8, avec l'outil d'écriture de fichiers.

## 4. Conclure

Dis combien de descriptions tu as écrites et cite deux ou trois exemples. Rappelle que l'utilisateur peut recharger la page de la Galaxie (F5) pour les voir, et qu'il peut réécrire n'importe quelle description depuis la fiche de la compétence (« Modifier la description »).
