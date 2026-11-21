import { expect, test } from "bun:test"
import { nameTail } from "../src/dashboard/client/lib/name-tail"

test("a name's tail is its last part after a separator, or its last 10 characters when that part is long", () => {
  expect(nameTail("github-com-acme-api")).toBe("api")
  expect(nameTail("acme/web.site")).toBe("site")
  expect(nameTail("acme-averyveryverylongpart")).toBe("rylongpart")
  expect(nameTail("acme")).toBe("")
  expect(nameTail("-acme")).toBe("")
  expect(nameTail("acme-")).toBe("")
})
