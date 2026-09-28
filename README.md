# luci-app-traffic-chart
live traffic chart that uses netifyd/nf_conntrack to work with hw offloading

<img width="1723" height="1117" alt="Bildschirmfoto vom 2026-09-21 11-59-59" src="https://github.com/user-attachments/assets/4feb4138-16df-443a-8d9d-8da589c54948" />
<img width="1723" height="1117" alt="Bildschirmfoto vom 2026-09-21 11-59-32" src="https://github.com/user-attachments/assets/ef72e11c-fc79-465f-91e3-19dac0053477" />
<img width="1723" height="1117" alt="Bildschirmfoto vom 2026-09-21 11-58-59" src="https://github.com/user-attachments/assets/6b54718c-c101-488a-bb67-428436d76dd5" />
<img width="1723" height="1117" alt="Bildschirmfoto vom 2026-09-21 11-58-16" src="https://github.com/user-attachments/assets/6c471137-fbe7-401e-ac30-a4047429df9b" />
<img width="1723" height="1117" alt="Bildschirmfoto vom 2026-09-21 11-56-21" src="https://github.com/user-attachments/assets/96d4bd4b-f188-4b43-9512-146ccb0cddbf" />


The basic idea

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
