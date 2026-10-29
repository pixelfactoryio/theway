# Maintainers

Run these steps once, after the `pixelfactoryio/theway` repository is created. They need admin access to the repository.

1. Allow squash merges only, use the PR title and body as the squash commit, delete merged branches, and turn off the wiki and projects:

   ```bash
   gh api -X PATCH repos/pixelfactoryio/theway \
     -F allow_squash_merge=true \
     -F allow_merge_commit=false \
     -F allow_rebase_merge=false \
     -f squash_merge_commit_title=PR_TITLE \
     -f squash_merge_commit_message=PR_BODY \
     -F delete_branch_on_merge=true \
     -F has_wiki=false \
     -F has_projects=false
   ```

2. Enable private vulnerability reporting:

   ```bash
   gh api -X PUT repos/pixelfactoryio/theway/private-vulnerability-reporting
   ```

3. Apply the `main` ruleset, from the repository root:

   ```bash
   gh api -X POST repos/pixelfactoryio/theway/rulesets --input .github/rulesets/main.json
   ```

4. In Settings → Actions → General, enable "Allow GitHub Actions to create and approve pull requests". release-please needs it to open release PRs.

5. In Settings → Pages, set the source to "GitHub Actions".
