# Coding standards

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

## Each action intent checks access itself

A loader guard does not protect the action: anyone can post to it directly.
Every intent that reads or writes Course content calls the same access check
the page's existing intents use, and checks that the record in the URL
belongs to the Course in the URL. The discussion intents in
`app/routes/courses.$slug.lessons.$lessonId.tsx` call `requireContentAccess`
for this.

## A comment describes the code next to it

A comment that says "insert" above a delete, or "soft-delete" above a hard
delete, is worse than no comment. The reader believes it over the code.
Change the comment in the same diff that changes the behaviour, and leave
untouched code's comments alone.
