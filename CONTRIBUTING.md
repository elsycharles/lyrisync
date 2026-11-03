# Contributing

## Branching model: Gitflow

| Branch | Branches off | Merges into | Purpose |
| --- | --- | --- | --- |
| `main` | — | — | Production. Every commit is a tagged release (`vX.Y.Z`). |
| `develop` | `main` | — | Integration branch. Always builds and passes tests. |
| `feature/<name>` | `develop` | `develop` | New work. |
| `bugfix/<name>` | `develop` | `develop` | Non-urgent fixes. |
| `release/X.Y.Z` | `develop` | `main` **and** `develop` | Version bump, last fixes, changelog. Tag `vX.Y.Z` on `main`. |
| `hotfix/X.Y.Z` | `main` | `main` **and** `develop` | Urgent production fix. Tag `vX.Y.Z` on `main`. |

Rules:

- Never commit directly to `main` or `develop`.
- Merge with `--no-ff` (or a GitHub PR with a merge commit) so each feature stays visible in history.
- Feature PRs target `develop`. Only `release/*` and `hotfix/*` reach `main`.
- The local git config already holds the `gitflow.*` keys, so `git flow` (git-flow-avh) works out of the box if you install it.

```sh
# feature
git switch develop && git switch -c feature/word-level-export
# ... commits ...
git switch develop && git merge --no-ff feature/word-level-export && git branch -d feature/word-level-export

# release
git switch -c release/0.2.0 develop
npm version 0.2.0 --no-git-tag-version && git commit -am "chore(release): 0.2.0"
git switch main && git merge --no-ff release/0.2.0 && git tag -a v0.2.0 -m "v0.2.0"
git switch develop && git merge --no-ff release/0.2.0 && git branch -d release/0.2.0
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

## Before pushing

```sh
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e   # needs `npx playwright install chromium` once
```
