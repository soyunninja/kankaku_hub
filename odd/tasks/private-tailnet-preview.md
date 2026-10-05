# Private tailnet preview

## Intent
Enable remote viewing of local kankaku-hub `/prueba` over the owner's Tailscale network, including authenticated backend access. User explicitly approved setup; no questions needed.

## Scope and constraints
Private Tailscale Serve only, never Funnel/public Internet or VPS/deploy. Preserve existing HTTPS443 macbook-air.tailef2f3.ts.net root proxy to http://127.0.0.1:7317. Keep loopback listeners and existing user processes; no forced stop/reset. Add separate HTTPS8443 preview service only after source checks. Keep all unrelated dirty work, including Organization prototype, dashboard/styles/settings and docs. No commits, staging, backend fixture writes or credential logging.

## Baseline and design
Read-only actual tailscale serve status --json reports only HTTPS443 and its root handler. Current Nuxt listens [::1]:3000, PocketBase127.0.0.1:8090. nuxt.config.ts runtime public pbUrl empty; pocketbase.client.ts defaults dev to localhost8090, unsuitable for remote browsers. Recommended same-origin Nuxt development /api reverse proxy to local PB; default SDK origin window.location.origin in all environments, explicit NUXT_PUBLIC_PB_URL retains precedence. Permit only exact tailnet hostname in dev host checks if needed. Tailscale HTTPS8443 will proxy the validated Nuxt loopback service, preserving443. Independent diagnosis confirmed current3000 is active Nuxt dev with automatic config reload; no new frontend process is needed. Existing feature branch feat/card-contained-form-backgrounds.

## Tasks
- [x] T1 (done): Implement safe same-origin development backend proxy and PocketBase URL resolution, focused test-first regressions; preserve explicit override and static production behavior; local type/runtime checks.
- [x] T2 (done): Add private Tailscale Serve HTTPS8443 mapping, confirm original443 mapping unchanged and no Funnel; independently verify private HTTPS route, health/login/API, origin and prototype tabs.

## Acceptance and checks
No remote browser-loopback API requests; explicit PB override works; all original local routes work; same-origin /api/health returns healthy locally and through tailnet HTTPS. Existing443 service remains exactly intact. Auth and UI operate through https://macbook-air.tailef2f3.ts.net:8443/prueba with browser credentials kept secret. Focused unit tests RED/GREEN then typecheck and independent browser verification. New temporary Playwright results only, --reporter=line, pnpm exec direct commands without literal --. No creation/deletion backend fixtures. Tailscale config mutations are additive, not resets.

## Evidence and progress
Explorer maps dev topology; parent independently confirmed actual Serve config/listeners/help and read frontend config/client plugin. Native review switch previously confirmed globaloff; reassess after writer to route verifier. Writer implemented four scoped frontend files: origin-only Nitro devProxy for /api, exact tailnet allowedHost, absolute-origin resolver with explicit override retained, seven regression tests. Observed RED import/config assertion and GREEN7passed; typecheck passed. Runtime localhost3000 /api/health incorrectly returns SPA HTML while PB8090 returns healthJSON; automatic config reload not observed. Existing listener remains PID70916, untouched. Native ASSESS unassessable (untracked scope), RDDoff; independent verifier required. Independent verification found implementation defect: H3 strips mounted /api prefix, origin-only proxy sends /api/health as /health. Actual /api/api/health succeedsJSON, proving path mismatch. Correct target must include /api. 22 focusedtests/typecheck passed but config assertion encoded wrong target. Isolated3001 attempt failed safely due existing Nuxt build-directory lock; no new listener, no lock bypass. Failure log retained in temporary private-tailnet-runtime.YkDUYl directory. Writer correction complete: /api target http://127.0.0.1:8090/api restores H3-stripped prefix. Actual assertion RED1failed6passed and runtime Playwright RED1failed(text/html), GREEN7unitpassed+1runtimebrowserpassed; typecheck and diffcheck passed. ActiveNuxt auto-reloaded without forcedrestart; localhost3000/api/health and directPB return identical200healthyJSON. Parent additive Serve enabled successfully after checking baseline443 and absence8443: tailscale serve --bg --https=8443 --yes http://[::1]:3000. Native output confirms tailnet-only HTTPS8443 running; status JSON preserves443 root->127.0.0.1:7317 exactly and adds8443->http://::1:3000 (native normalized target). No AllowFunnel entry. Independent HTTPS verification proves DNS100.88.53.30 and trustedTLS succeed, but private /prueba,/login,/api/health return500 unknown proxy destination. Serve-normalized IPv6 target is not usable. All six prototypeE2Es failed before login; localhost-onlyhealth passed, nottailnetproof. Local22unit/typecheck/healthJSON still pass. Writer added testable fixed-host TCP loopback bridge and3Node regressions (HTTPheaders/path, halfclose and512KiB upgradebinary, refusedupstream). Observed importRED0pass1fail; GREEN3/3 after streamdrainrefactor; node syntax/diffchecks pass. Started only127.0.0.1:3002 bridgePID46160, logs/PID /tmp/private-tailnet-bridge.8nBIhp. Actualbridge/prueba200HTML and/api/health200healthyJSON with tailnethost. OriginalNuxt70916/PB70878 intact. Parent updated ONLYown8443 mapping to http://127.0.0.1:3002, guardingfreshbaseline; nativeServeJSON443unchanged, noFunnel. Final independent private HTTPS acceptance PASSED: DNS100.88.53.30 trustedTLS verify0; /prueba,/login,/api/health200; actualUIlogin/dashboard/allthreeTabs succeed. Auth/totals/catalog/taskentries/healthrequests use onlyprivateHTTPSorigin, no browserloopbackAPI. 6/6prototypeE2Es pass via8443; separatelocalhosthealth1/1pass (notcountedastailnetproof);22/22frontendunit+3/3bridgeNode+typecheck/diffcheckpass. No browserpage/consoleerrors; Vite connected viawss://macbook-air.tailef2f3.ts.net:8443/_nuxt/. Serve443preserved,8443onlyaddition,noFunnel. Originalserversandbridgeintact. Commit evidence intentionally absent, no authorization.

## Rollback
Native enable output supplies exact targeted rollback: tailscale serve --https=8443 off. Do not execute without a reason/authorization; never tailscale serve reset or touching443. Source changes remain unstaged for owner review; no destructive Git rollback. Record exact final command after validating CLI syntax.

## Final checks and limits
Independent passing evidence in /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/private-tailnet-green.RcyrJt/{prototype,local-health}/. Prior failedtraces preserved; initialproxy-path healthfailure and ServeIPv6destinationfailure resolved, finalfocusedchecks have nofailures. One manualprobe initially lackedawaitedtabassertion; correctedprobe and sixexistingE2Es passed. Phone-specificACL, Macsleep/reboot availability, live source-edit HMR reload, and bridgeautostart were not tested. Preview requires this Mac awake, existingNuxt/PB and bridge running. Servebackgroundconfig persists, but no launchd/systemautostart was installed. No fullbuild/fullaccessibilitysuite/native review (RDDoff); unassessableassessment handled through independentverification.

## Runtime operations
- Active bridge: PID 46160; log/PID directory: /tmp/private-tailnet-bridge.8nBIhp.
- Before stopping it, confirm that the PID still runs `node scripts/tailnet-loopback-proxy.mjs` and owns `127.0.0.1:3002`; do not act on a reused PID.
- To restart the bridge from the repository root, first confirm port 3002 is free, then:
```sh
umask 077
logdir=$(mktemp -d /tmp/private-tailnet-bridge.XXXXXX)
nohup node scripts/tailnet-loopback-proxy.mjs </dev/null >"$logdir/bridge.log" 2>&1 &
printf '%s\n' "$!" >"$logdir/bridge.pid"
```
- To disable only the preview: `tailscale serve --https=8443 off`. Leave port 443 untouched.
- These operational commands were documented, not executed at closure.

## Next step
Owner enables Tailscale on remote device and opens https://macbook-air.tailef2f3.ts.net:8443/prueba, logs into existing local developmentHub account. Keep Macawake; noVPS/publicInternet/deploy/commits. Permanent startup/sleep policy is outside this temporarypreview scope.
