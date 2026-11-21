import { expect, test } from "bun:test"
import { idChipLeast } from "../src/dashboard/client/components/list-kit"
import { nameTail } from "../src/dashboard/client/lib/name-tail"

test("a name's tail is its last part after a separator, or its last 10 characters when that part is long", () => {
  expect(nameTail("github-com-acme-api")).toBe("api")
  expect(nameTail("acme/web.site")).toBe("site")
  expect(nameTail("acme-averyveryverylongpart")).toBe("rylongpart")
  expect(nameTail("acme")).toBe("")
  expect(nameTail("-acme")).toBe("")
  expect(nameTail("acme-")).toBe("")
})

test("an ID's chip shows it whole when short, else at least 10 characters and room for its tail and 3 of its head", () => {
  expect(idChipLeast("add-x")).toBe(5)
  expect(idChipLeast("add-split-store")).toBe(10)
  expect(idChipLeast("add-tower-i-hecaton")).toBe(11)
  expect(idChipLeast("add-acme-meta-description")).toBe(15)
  expect(idChipLeast("add-acme-observability")).toBe(14)
  expect(idChipLeast("averyveryverylongidwithnoseparator")).toBe(10)
})
