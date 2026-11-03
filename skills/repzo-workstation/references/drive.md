# Drive

Use this reference for Drive, the workspace file manager: folders, files, uploads, downloads, sharing, stars, and Trash. A file that only makes sense on one record is a record attachment instead; use `repzo media` for those. Drive's **Linked Files** section isn't available here, so list a record's attachments with `repzo media list`.

Drive needs a browser login. Files belong to people, so API keys get `forbidden` with `details.code` `delegated_user_required`, and a profile signed in before these commands existed gets `Missing required scope` until the user runs `repzo auth login` again.

## Who can do what

You act as the signed-in person, with exactly their access. A workspace owner can't see a colleague's private files either.

- **Owner of the file or folder:** everything, including rename, move, Trash, delete, and share.
- **Shared as `edit` (folders only):** add files and subfolders inside it. They own what they add, and can't rename the shared folder or change the owner's files.
- **Shared as `view`, or a folder with `visibility: org`:** open and download.

Something you can't see returns `not_found`, so a 404 can also mean "not shared with you". Sharing a folder covers everything inside it.

## Find things

```bash
repzo drive folders list
repzo drive folders list --query parentId=FOLDER_ID
repzo drive files list --query parentId=FOLDER_ID --all
repzo drive search --query q=contract
repzo drive recent
repzo drive shared
repzo drive starred
repzo drive trash
repzo drive folders get FOLDER_ID
```

Without `parentId`, the lists show your own top-level items. `drive search` and `drive recent` only cover what you own, so check `drive shared` when something from a colleague doesn't turn up. `drive shared`, `drive starred`, and `drive trash` return `{ folders, files, meta }` with up to 200 of each; `meta.truncated` says when there's more.

## Upload and download

```bash
repzo drive files upload ./contract.pdf --query parentId=FOLDER_ID --dry-run
repzo drive files upload ./contract.pdf --query parentId=FOLDER_ID --yes
repzo drive files download FILE_ID --output ./downloads
```

Without `parentId`, the file goes to the top level of the user's Drive. Files over 25 MB go straight to storage automatically, and the workspace's storage limit returns `payment_required`. For a retry after a failed upload, re-check the folder first so the file doesn't end up there twice, or use one `--idempotency-key`.

`--output` can be a folder or a file path. The default is the file's name in the current folder. A download refuses to overwrite an existing file unless you add `--force`, so only add it when the user wants that. Files in Trash can't be downloaded until restored.

## Organize

```bash
repzo drive folders create --data '{"name":"Clients","parentId":"FOLDER_ID"}' --dry-run
repzo drive folders update FOLDER_ID --data '{"name":"Clients 2027"}' --dry-run
repzo drive files update FILE_ID --data '{"name":"signed.pdf","parentId":"FOLDER_ID"}' --dry-run
repzo drive files update FILE_ID --data '{"parentId":null}' --dry-run
repzo drive files star FILE_ID --yes
repzo drive files unstar FILE_ID --yes
```

`parentId: null` moves it to the top level. Moving a file into a shared folder gives everyone there access to it, so say so before doing it.

## Remove things

```bash
repzo drive files trash FILE_ID --dry-run
repzo drive files restore FILE_ID --yes
repzo drive files delete FILE_ID --dry-run
```

When the user asks to remove something, use `trash`; they can undo it, and Trash empties itself after 30 days. Use `delete` only when they ask for it to be gone forever. It can't be undone, and it refuses anything not already in Trash (`conflict`). Deleting a folder this way doesn't move what's inside it, so check `drive files list` and `drive folders list` for its contents first.

## Share

```bash
repzo metadata users
repzo metadata departments
repzo drive folders share FOLDER_ID --data '{"sharedWithUserId":"USER_ID","permission":"edit"}' --dry-run
repzo drive folders share FOLDER_ID --data '{"sharedWithDepartmentId":"DEPARTMENT_ID"}' --dry-run
repzo drive files share FILE_ID --data '{"sharedWithEmail":"client@example.com"}' --dry-run
repzo drive folders shares FOLDER_ID
repzo drive unshare SHARE_ID --dry-run
```

Send exactly one of `sharedWithUserId`, `sharedWithDepartmentId`, or `sharedWithEmail`. Only the owner can share or see who something is shared with. Files are always view-only; folders take `permission: view|edit`. Sharing again with the same person or department changes their access, so that's how to raise or lower it.

Be careful with these two, and confirm them with the user even if they asked for the outcome in general terms:

- **`sharedWithEmail`** sends a real email outside the workspace, with a link that opens the file or folder without an account for 7 days. Each call sends another invite.
- **`visibility: org`** on a folder lets everyone in the workspace view it and everything inside.

## Not available here

Linked Files is web-only. There's no public link: everyone needs either a workspace login or an email invite.
