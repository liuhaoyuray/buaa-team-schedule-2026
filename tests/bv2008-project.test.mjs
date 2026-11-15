import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(
  new URL(
    "../features/bv2008-members/extension/project-hours-bridge.js",
    import.meta.url,
  ),
  "utf8",
);
function setup() {
  const state = {
    current: true,
    submitted: 0,
    uploads: 0,
    skipped: [],
    rows: [{ name: "模拟甲", userNumber: "001", uid: "uid1", durationHour: 2 }],
  };
  const events = new EventTarget();
  const document = {
    querySelector: () => ({
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: new Map([
                ["user", { userInfo: { currOrgInfoActive: { orgId: "G" } } }],
              ]),
            },
          },
        },
      },
    }),
    addEventListener: (...args) => events.addEventListener(...args),
    dispatchEvent: (event) => events.dispatchEvent(event),
  };
  const api = {
    async details() {
      const marker = "/activity/findDetailsByIid";
      return {
        success: true,
        data: {
          resultData: {
            dataMap: {
              details: {
                iid: "ACT",
                activityPostList: [{ iid: "A" }, { iid: "B" }],
              },
            },
          },
        },
      };
    },
    async dates() {
      const marker = "/activityScheduling/getServerTimeByActivityId";
      return { success: true, data: { resultData: ["2026-11-01"] } };
    },
    async parse() {
      const marker = "/activityTiming/importDurationExcel";
      return {
        success: true,
        data: { resultData: { rows: state.rows, skipped: state.skipped } },
      };
    },
    async upload() {
      const marker = "/file/uploadTemp";
      state.uploads++;
      return {
        success: true,
        data: { resultData: { fileData: { newName: "proof.png" } } },
      };
    },
    async submit() {
      const marker = "/activityTiming/batchSubmitDuration";
      state.submitted++;
      return { success: true };
    },
    async member() {
      const marker = "/activityTiming/getTimingList";
      return {
        success: true,
        data: {
          resultData: {
            totalCount: 1,
            dataList: [{ uid: "uid1", userNumber: "001" }],
          },
        },
      };
    },
    async history() {
      const marker = "/activityTiming/getDurationRecordInfoList";
      return {
        success: true,
        data: {
          resultData: {
            dataList: [{ time: "2026-11-01", durationHour: 2, state: 1 }],
          },
        },
      };
    },
  };
  const context = vm.createContext({
    window: { document, File },
    document,
    CustomEvent,
    Uint8Array,
    atob,
    crypto,
    __buaaProjectNative: {
      current: () => state.current,
      module: async () => api,
    },
  });
  vm.runInContext(source, context);
  async function request(value) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const listener = (event) => {
        const data = JSON.parse(event.detail);
        if (data.requestId !== requestId) return;
        events.removeEventListener("buaa-hours-native-result", listener);
        resolve(data);
      };
      events.addEventListener("buaa-hours-native-result", listener);
      events.dispatchEvent(
        new CustomEvent("buaa-hours-native-request", {
          detail: JSON.stringify({
            target: { id: "G", activityId: "ACT", postId: "A" },
            postId: "B",
            date: "2026-11-01",
            ...value,
            requestId,
          }),
        }),
      );
    });
  }
  const prepare = {
    action: "prepare",
    records: [{ name: "模拟甲", number: "001", hours: 2 }],
    file: {
      base64: "eA==",
      name: "template.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    proof: { base64: "eA==", name: "proof.png", type: "image/png" },
    notes: "实际服务",
  };
  return { state, request, prepare };
}
test("project submission requires a verified parse ticket and consumes it exactly once", async () => {
  const { state, request, prepare } = setup();
  const ready = await request(prepare);
  assert(ready.ticket);
  assert.equal(
    state.submitted,
    0,
    "parsing and upload must not submit approval",
  );
  assert.equal(
    (await request({ action: "commit", ticket: ready.ticket })).status,
    "submitted",
  );
  assert.equal(
    (await request({ action: "commit", ticket: ready.ticket })).status,
    "blocked",
  );
  assert.equal(state.submitted, 1);
});
test("skipped parser rows, mismatched identities and cross-project posts never reach approval", async () => {
  const { state, request, prepare } = setup();
  state.skipped = [{ reason: "该日期已有时长" }];
  assert.equal((await request(prepare)).status, "blocked");
  assert.equal(state.uploads, 0);
  state.skipped = [];
  state.rows[0].userNumber = "OTHER";
  assert.equal((await request(prepare)).status, "blocked");
  assert.equal(state.uploads, 0);
  state.rows[0].userNumber = "001";
  assert.equal(
    (await request({ ...prepare, postId: "OUTSIDE" })).status,
    "blocked",
  );
  assert.equal(state.submitted, 0);
});
test("project changes invalidate a prepared approval and pending history stays occupied", async () => {
  const { state, request, prepare } = setup();
  const history = await request({
    action: "member",
    number: "001",
    person: { identifier: "number" },
  });
  assert.deepEqual(history.used, ["2026-11-01"]);
  const ready = await request(prepare);
  state.current = false;
  assert.equal(
    (await request({ action: "commit", ticket: ready.ticket })).status,
    "blocked",
  );
  assert.equal(state.submitted, 0);
});
