# Traffic Chart (luci-app-traffic-chart)

Live and historical traffic per application, device and destination, next to the real link rate.
It uses two counters and nothing else: per-flow bytes/packets from `/proc/net/nf_conntrack` and the
byte counters of the shaper qdiscs (`tc -s qdisc`). It does not depend on the shaper or classifier in
use (nss-rk.qos, sqm-scripts, qosmate, dscpclassify, none at all): no marks, no DSCP, no port lists,
no other tool's config files.

## Files

| File | Install as | Purpose |
|---|---|---|
| `trafficchart-agg` | `/usr/libexec/trafficchart-agg` | daemon: walks conntrack, keeps totals, rates, history; writes `/tmp/trafficchart/stats.json` |
| `trafficchart-tc` | `/usr/libexec/trafficchart-tc` | link counters + shaper drops/ECN/backlog (called by the daemon every poll) |
| `trafficchart-common` | `/usr/libexec/trafficchart-common` | settings helper (`tc_cfg`) and shaper detection (kernel: ingress redirect to an ifb, or NSS `nsstbl`) |
| `trafficchart-hosts` | `/usr/libexec/trafficchart-hosts` | device identity: neighbour table (MAC), DHCP names, router addresses |
| `trafficchart-v6prefixes` | `/usr/libexec/trafficchart-v6prefixes` | LAN IPv6 prefixes (what counts as LAN side) |
| `trafficchart-apps` | `/usr/libexec/trafficchart-apps` | optional: netifyd flow labels -> application names (needs `socat`, `netifyd`) |
| `trafficchart` | `/etc/init.d/trafficchart` | procd service |
| `luci.trafficchart` | `/usr/libexec/rpcd/luci.trafficchart` | rpcd plugin: serves `stats.json` and `history*.json` to the page |
| `traffic_chart.js` | `/www/luci-static/resources/view/network/traffic_chart.js` | the chart page |
| `trafficchart_config.js` | `/www/luci-static/resources/view/network/trafficchart_config.js` | the settings page |
| `luci-app-traffic-chart_menu.json` | `/usr/share/luci/menu.d/luci-app-traffic-chart.json` | menu entries |
| `luci-app-traffic-chart.json` | `/usr/share/rpcd/acl.d/luci-app-traffic-chart.json` | ACL |
| `trafficchart.config` | `/etc/config/trafficchart` | default settings |
| `nss-rk.qos`, `nss-rk_qos.help` | `/usr/lib/sqm/nss-rk.qos`, `.../nss-rk.qos.help` | separate SQM shaper script for NSS; not needed by the chart |

Scripts must be executable (`chmod +x`). After installing: `/etc/init.d/trafficchart enable && /etc/init.d/trafficchart restart`,
then `/etc/init.d/rpcd restart`.

## Requirements

`tc` (tc-tiny or tc-full), conntrack accounting (the daemon switches `nf_conntrack_acct` on).
Optional: `socat` + `netifyd` (application names; without them flows are named `[proto/port]`),
`timeout` (persistent history on a network share).

## What is counted

A flow counts when it is LAN client -> non-local destination, router -> WAN, or WAN-initiated to a
LAN host (port forward, IPv6 inbound). LAN<->LAN and LAN -> router flows are not WAN traffic. The
router's own WAN traffic is the device "Router". Totals are per-flow deltas, so closing flows never
remove bytes. The link rate comes from the qdisc counters, so it can differ from the conntrack sum
(router services, dropped packets, link layer headers).

## Settings (`/etc/config/trafficchart`, section `global`)

| Option | Default | Meaning |
|---|---|---|
| `enabled` | 1 | start the daemon |
| `apps` | 1 | run `trafficchart-apps` (netifyd labels) |
| `backend` | auto | `auto`, `nss` or `generic` |
| `interval` | 4 | poll interval in seconds (stretches under load, max 20) |
| `wan_dev` | (auto) | WAN device(s) or logical interface(s), space separated |
| `sock` | `/var/run/netifyd/netifyd.sock` | netifyd socket |
| `persist_dir`, `persist_mount`, `persist_sec`, `persist_timeout` | off | keep the history across reboots |

Only for the `nss-rk.qos` script: `dns_redirect`, `dns_redirect_exclude`, `ttl_fix`, `bulk_bytes`, `reset_ct_marks`
(restart SQM after changing them).

## History

5 minute buckets for 24 h, hourly buckets for 8 days, daily buckets for 400 days. They live in RAM
(`/tmp/trafficchart/history*.json`) and, with `persist_dir`, are appended to `history-*.jsonl` there.

<img width="1950" height="1363" alt="Bildschirmfoto vom 2026-09-29 01-05-22" src="https://github.com/user-attachments/assets/2a2589db-1969-4608-b04e-83a4ab8bb47d" />
<img width="1950" height="1363" alt="Bildschirmfoto vom 2026-09-29 01-06-35" src="https://github.com/user-attachments/assets/2505da5a-d370-4fa7-a157-50a6899278dc" />
<img width="1950" height="1363" alt="Bildschirmfoto vom 2026-09-29 01-06-03" src="https://github.com/user-attachments/assets/a627bee4-34f6-4996-8b9e-989d6fcefe71" />
<img width="1950" height="1363" alt="Bildschirmfoto vom 2026-09-29 01-01-44" src="https://github.com/user-attachments/assets/e66ec458-9168-45d3-b8fd-a8d767f3850d" />
<img width="1950" height="1363" alt="Bildschirmfoto vom 2026-09-29 01-02-24" src="https://github.com/user-attachments/assets/bdfe1d4f-0fb9-4828-94a8-0b42950c4def" />




how it works ...

With hardware flow offloading, packets in an established connection can bypass most of the normal Linux forwarding path. So something like:

LAN client
   │
   ▼
conntrack / firewall
   │
   ├── first packets ──► CPU
   │
   └── established flow
            │
            ▼
       HW offload/PPE
            │
            ▼
           WAN

means you cannot reliably build a per-application traffic graph by simply counting packets that traverse iptables/nftables.

The project instead uses conntrack accounting as the per-flow source. Its daemon periodically reads:

/proc/net/nf_conntrack

and uses the byte/packet counters associated with each connection. It remembers the previous counter value and records only the delta.

So conceptually:

conntrack flow:

previous bytes = 500 MB
current bytes  = 650 MB

traffic-chart contribution = 150 MB

That continues to work even when the actual packets subsequently take the hardware fast path, because the hardware-offloaded connection remains represented in conntrack.

Linux's flowtable documentation also distinguishes software [OFFLOAD] from hardware [HW_OFFLOAD]; hardware-offloaded flows are still associated with conntrack.
Why it uses TWO different counters

This is the interesting part.

The project has essentially two accounting layers:
1. Per-flow/application traffic

trafficchart-agg reads conntrack:

/proc/net/nf_conntrack
        │
        ▼
per-flow byte counters
        │
        ▼
application/device/destination aggregation
        │
        ▼
Traffic Chart

The code explicitly enables:

/proc/sys/net/netfilter/nf_conntrack_acct = 1

so that conntrack exposes byte/packet accounting.

This is what allows it to say things like:

YouTube       350 MB
Firefox       120 MB
Device A      500 MB
Device B       80 MB

rather than just:

WAN interface = 580 MB

2. Actual link rate

For the actual WAN traffic rate it uses tc/qdisc counters where possible, rather than adding up conntrack flows.

The rate is obtained from the traffic-control counters and that those samples are synchronized with the conntrack accounting.

For example:

                    ┌─ conntrack ──► application/device accounting
                    │
packet flow ────────┤
                    │
                    └─ tc/qdisc ───► actual link traffic/rate

That's important because conntrack accounting and the interface/qdisc accounting don't necessarily count exactly the same bytes.
And it compensates for the difference

The project actually has a "Not attributed" category.

It calculates approximately:

tc bytes
 - conntrack bytes
 - L2 overhead
------------------
= unaccounted traffic

This calculation and accounts for Ethernet/VLAN/PPPoE headers because tc and conntrack can count different layers.

So you can have:

WAN/tc:
    1.02 Gbit/s

conntrack:
    0.99 Gbit/s

difference:
    ~30 Mbit/s

and it doesn't simply pretend that the missing 30 Mbit/s belongs to Firefox/YouTube/etc. It can show it as un-attributed traffic.
What happens with HW offload

Suppose you download a 10 GB file.

Initially:

TCP SYN
   ↓
CPU
   ↓
conntrack created
   ↓
flow gets HW_OFFLOAD

Then:

       ┌─────────────────────────────┐
       │        Hardware PPE         │
       │                             │
LAN ───┤  10 GB of packets ───── WAN │
       └─────────────────────────────┘

The CPU isn't processing every packet anymore.

But conntrack still has something like:

src=192.168.1.20
dst=...
sport=...
dport=443

bytes=...
packets=...

and the traffic-chart daemon periodically sees:

poll #1:  100 MB
poll #2:  250 MB
poll #3:  500 MB

and calculates:

+150 MB
+250 MB

rather than needing to see the individual packets.

That's the key trick.
One important caveat

That means its accuracy depends on your platform/driver/kernel maintaining meaningful conntrack statistics for HW-offloaded flows.

This is an important distinction because hardware-offload statistics have historically been somewhat platform-dependent. There has even been recent Linux kernel work specifically to propagate statistics for HW-offloaded flows that are delegated through parent devices/DSA.
In short

The architecture is roughly:

                  ┌──────────────────────┐
                  │      Conntrack       │
                  │ flow byte counters   │
                  └──────────┬───────────┘
                             │
                             ▼
                      trafficchart-agg
                             │
                    per-flow deltas
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
          Application      Device      Destination


Actual traffic rate:

WAN ──► tc/qdisc/interface counters ──► link rate


Then:

             tc traffic
                 │
                 ├── conntrack traffic
                 │
                 └── L2 overhead
                         │
                         ▼
                  "Not attributed"

So HW offloading can remain enabled while still getting application/device traffic graphs, because the chart isn't trying to observe every accelerated packet. It observes the accounting associated with the connection.
