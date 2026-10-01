# OpenWrt Traffic Chart feed

Package feed for **luci-app-traffic-chart**: live traffic chart for LuCI (per application, device and
destination, busiest flows, shaper health, history) plus the SQM script `nss-trafficchart.qos` for
Qualcomm NSS hardware offload.

Maintainer: m0g13r <155771712+m0g13r@users.noreply.github.com> - License: GPL-2.0-or-later

| Package | Version |
|---|---|
| [luci-app-traffic-chart](luci-app-traffic-chart/) | 1.1.0-r12 |

Details, settings and troubleshooting: [luci-app-traffic-chart/README.md](luci-app-traffic-chart/README.md),
changes: [CHANGELOG](luci-app-traffic-chart/CHANGELOG.md).

## Use as feed (build system)
Add to `feeds.conf` (or `feeds.conf.default`):

```
src-git trafficchart https://github.com/m0g13r/luci-app-traffic-chart.git
```

Then:

```sh
./scripts/feeds update trafficchart
./scripts/feeds install -a -p trafficchart
make menuconfig        # LuCI -> 3. Applications -> luci-app-traffic-chart
make package/luci-app-traffic-chart/compile V=s
```

## Install on the router
Copy the built package (`.ipk` or `.apk`) to the router and install it with `opkg install` or `apk add --allow-untrusted`.
Afterwards open **Network -> Traffic Chart** in LuCI. When upgrading from the old `nss-rk.qos`, restart SQM once
(`/etc/init.d/sqm restart`); the SQM entry is migrated automatically.
