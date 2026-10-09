---
registries:
  kit: [kit/lint@1.0.0]
dirs: [.claude]
---

# A registry nobody declared is named, with where it was looked for

Outside a project, `add` reads your user scope, and says so.

```console
$ aireg add nope
? 1
error: No registry named "nope" in your user scope.
  code: not_found
hint: Declare one first with `aireg registry add <address> -g`, such as github.com/owner/repo.
```

In a project, every command that takes a registry says where it looked: one that can install through a registry your user scope declares looked there too.

```console
$ aireg init -y
...
$ aireg registry add [ROOT]/kit --as kit
...
$ aireg add nope
? 1
error: No registry named "nope" in this project or your user scope.
  code: not_found
hint: Use kit, or declare another with `aireg registry add <address>`.
$ aireg registry show nope
? 1
error: No registry named "nope" in this project or your user scope.
  code: not_found
hint: Use kit, or declare another with `aireg registry add <address>`.
$ aireg search lint --registry nope
? 1
error: No registry named "nope" in this project or your user scope.
  code: not_found
hint: Use kit, or declare another with `aireg registry add <address>`.
$ aireg sync nope
? 1
error: No registry named "nope" in this project.
  code: not_found
hint: Use kit, or declare another with `aireg registry add <address>`.
$ aireg registry remove nope
? 1
error: No registry named "nope" in this project.
  code: not_found
hint: Use kit, or declare another with `aireg registry add <address>`.
```
