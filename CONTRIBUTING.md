# Contributing

## Branch protection

`main` is protected. Changes reach it through a pull request:

| Rule | Setting |
|---|---|
| Pull request required | yes |
| Approving reviews required | 1 |
| Stale reviews dismissed on new commits | yes |
| Approval required after the last push | yes |
| Status check required | `build` (the CI workflow) |
| Branch must be up to date before merging | yes |
| Conversations must be resolved | yes |
| Force pushes / branch deletion | blocked |
| Enforced on administrators | **no** |

Administrators are deliberately exempt. GitHub does not let anyone approve their own pull
request, so on a single-maintainer repository enforcing the review requirement on admins would
make it impossible to merge anything. The repository owner keeps a bypass (`gh pr merge
--admin`, or a direct push) for that reason.

For everyone else the rule is absolute: no approval, no merge.

## Working on a change

```bash
git checkout -b your-change
# …edit…
npm run typecheck && npm test && npm run build
git commit
git push -u origin your-change
gh pr create
```

CI must be green before the merge button unlocks. It runs the type checks, the tests, a
production build, and verifies that the generated assets in `assets/` still match what
`npm run assets` produces.

## Releasing

Builds are **not** kept in the repository or in the working tree — GitHub Releases is the only
place they live. `npm run package:linux` wipes `release/` before building, so old versions do
not accumulate.

```bash
npm version minor          # or patch / major
npm run package:linux
gh release create "v$(node -p "require('./package.json').version")" \
  release/*.deb release/*.AppImage \
  --title "…" --notes "…"
```

Write release notes for someone deciding whether to upgrade: what changed, what it means for
their settings, and anything that is still unverified.

## Verification expectations

Two of the three data sources need credentials, so their code paths are covered by tests
against their documented schemas rather than the live APIs. If you hold a token, exercise the
real feed and say so in the pull request — that is the gap most worth closing.
