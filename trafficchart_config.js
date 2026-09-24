'use strict';
'require form';
'require view';

return view.extend({
    render: function() {
        var m, s, o;

        m = new form.Map('trafficchart', _('Traffic Chart'),
            _('Settings for the traffic-chart aggregator (trafficchart-agg) and the SQM traffic classes it shares with nss-rk.qos. ' +
              'Saving restarts the aggregator (cumulative totals reset, the history survives).'));

        s = m.section(form.TypedSection, 'trafficchart', _('General'));
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Flag, 'enabled', _('Enable'), _('Disable to stop the aggregator entirely (0 = do not start the daemon).'));
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'apps', _('Application names'), _('Run trafficchart-apps (netifyd) to label flows by application. Needs socat + netifyd.'));
        o.default = '1';
        o.depends('enabled', '1');

        o = s.option(form.ListValue, 'backend', _('Shaper backend'),
            _('Which shaper this router uses. Auto detects NSS hardware offload (nssifb) automatically.'));
        o.value('auto', _('Auto'));
        o.value('nss', _('NSS hardware offload'));
        o.value('generic', _('Generic (cake / htb+fq_codel)'));
        o.default = 'auto';

        o = s.option(form.ListValue, 'profile', _('Profile'),
            _('Preset tuning profile. The selected profile sets the low-level timing values, but you can still override any of them individually.'));
        o.value('balanced', _('Balanced'));
        o.value('low-cpu', _('Low CPU'));
        o.value('very-low-cpu', _('Very low CPU'));
        o.default = 'low-cpu';

        o = s.option(form.Value, 'interval', _('Poll interval'), _('Seconds between conntrack passes (starting point; auto-stretches under load, see below).'));
        o.datatype = 'uinteger';
        o.placeholder = '4';
        o.default = '4';

        o = s.option(form.Flag, 'adapt_interval', _('Adaptive interval'),
            _('Auto-stretch the poll interval once processing time grows into a meaningful share of the cycle, and ease it back down again.'));
        o.default = '1';

        o = s.option(form.Value, 'interval_max', _('Max interval'), _('Seconds: ceiling for the auto-stretched interval.'));
        o.datatype = 'uinteger';
        o.placeholder = '20';
        o.default = '20';
        o.depends('adapt_interval', '1');

        o = s.option(form.Value, 'adapt_budget', _('Adapt budget'), _('Fraction of the polling cycle the daemon may spend before stretching the interval.'));
        o.datatype = 'string';
        o.placeholder = '0.45';
        o.default = '0.45';

        o = s.option(form.Value, 'hosts_refresh_sec', _('Host refresh'), _('Seconds between neighbour/DHCP/host table refreshes.'));
        o.datatype = 'uinteger';
        o.placeholder = '180';
        o.default = '180';

        o = s.option(form.Value, 'gua_refresh_sec', _('IPv6 prefix refresh'), _('Seconds between LAN IPv6 GUA prefix re-detection.'));
        o.datatype = 'uinteger';
        o.placeholder = '300';
        o.default = '300';

        o = s.option(form.Value, 'tooltip_every', _('Tooltip refresh'), _('How often the tooltip matrices are rebuilt. 2 polls is a good low-CPU default for busy routers.'));
        o.datatype = 'uinteger';
        o.placeholder = '2';
        o.default = '2';

        o = s.option(form.Value, 'bulk_bytes', _('Bulk threshold'),
            _('Bytes: a WEB/P2P/BE flow above this size is shown as BULK. Shared with nss-rk.qos ' +
              '(restart SQM after changing this so the classifier picks it up too).'));
        o.datatype = 'uinteger';
        o.placeholder = '314572800';

        o = s.option(form.Value, 'l2_overhead', _('Link header size'),
            _('Bytes per packet the shaper counts but conntrack does not (used for "Not attributed"). "auto" measures it; ' +
              'or a fixed number: 14 Ethernet, 18 +VLAN, 22 +PPPoE, 26 +PPPoE+VLAN, 0 = no correction.'));
        o.placeholder = 'auto';

        o = s.option(form.Value, 'attr_ports', _('Router proxy port(s)'),
            _('Port(s) of a stream proxy running on the router itself, space separated. Traffic served to LAN devices ' +
              'through these ports is credited to the device instead of showing up as generic "Router" traffic. Leave empty to use every port except the infrastructure ports below.'));
        o.placeholder = '9999';

        o = s.option(form.Value, 'attr_skip_ports', _('Router infrastructure ports'),
            _('Only used when the field above is empty: ports that never count as "router is serving this device" (SSH, DNS, DHCP, NTP, DoT, mDNS, LuCI ...).'));
        o.placeholder = '22 53 67 68 80 123 443 853 5353 5355';

        s = m.section(form.TypedSection, 'trafficchart', _('History and persistent storage'),
            _('The History tab keeps three resolutions: 5 minute buckets (24 hours view), hourly buckets (week) and daily buckets (month, year). ' +
              'Without a storage path they live in RAM only and are lost on reboot.'));
        s.anonymous = true;
        s.addremove = false;

        function validPaths(section_id, value) {
            if (value === null || value === '') return true;
            var ok = value.trim().split(/\s+/).every(function(w) { return w !== '/' && /^\/[A-Za-z0-9._\/-]+$/.test(w); });
            return ok ? true : _('Absolute paths, separated by spaces; only letters, digits and . _ - / are allowed.');
        }

        o = s.option(form.Value, 'persist_dir', _('Storage path(s)'),
            _('Directory (or several, separated by spaces) the history is saved to and reloaded from after a reboot; empty = RAM only. ' +
              'All available targets are written (mirrors); a missing one is caught up when it is back. Only new buckets are appended, about 1 MB per day. ' +
              'Example: NAS share mounted at /mnt/nas plus a USB stick: /mnt/nas/traffic /mnt/sda1/trafficchart. The router mounts nothing itself.'));
        o.placeholder = '/mnt/nas/traffic /mnt/sda1/trafficchart';
        o.rmempty = true;
        o.validate = validPaths;

        o = s.option(form.Value, 'persist_mount', _('Required mount point(s)'),
            _('Optional, separated by spaces: a target below one of these paths is only used while the path is mounted (e.g. /mnt/nas /mnt/sda1). ' +
              'Prevents the history from ending up on the flash below a share that is not mounted yet.'));
        o.placeholder = '/mnt/nas /mnt/sda1';
        o.rmempty = true;
        o.validate = validPaths;

        o = s.option(form.Value, 'persist_sec', _('Write interval'),
            _('Seconds between two writes to the storage (minimum 60). A power failure loses at most this much; a clean stop, restart or reboot always writes everything.'));
        o.value('300', _('5 minutes'));
        o.value('900', _('15 minutes'));
        o.value('3600', _('1 hour (default)'));
        o.value('21600', _('6 hours'));
        o.value('86400', _('24 hours'));
        o.datatype = 'range(60,604800)';
        o.placeholder = '3600';

        o = s.option(form.Value, 'persist_timeout', _('Access timeout'),
            _('Seconds an access to a target may take before it is given up (3-120). A hanging NAS then blocks the aggregator for this long at most. Use the "soft" mount option for network shares.'));
        o.datatype = 'range(3,120)';
        o.placeholder = '10';

        o = s.option(form.Value, 'hist_sec', _('5 minute bucket length'), _('Seconds per bucket of the finest resolution (24 hours view).'));
        o.datatype = 'uinteger';
        o.placeholder = '300';

        o = s.option(form.Value, 'hist_keep', _('5 minute buckets kept'), _('Default 288 x 300 s = 24 h.'));
        o.datatype = 'uinteger';
        o.placeholder = '288';

        o = s.option(form.Value, 'hist_hour_keep', _('Hourly buckets kept'), _('Week view. Default 192 = 8 days.'));
        o.datatype = 'uinteger';
        o.placeholder = '192';

        o = s.option(form.Value, 'hist_day_keep', _('Daily buckets kept'), _('Month and year view. Default 400 days.'));
        o.datatype = 'uinteger';
        o.placeholder = '400';

        s = m.section(form.TypedSection, 'trafficchart', _('Advanced'));
        s.anonymous = true;
        s.addremove = false;
        s.optional = true;

        o = s.option(form.Value, 'app_max', _('Max applications'), _('Applications kept individually; further ones are summed as "(other)".'));
        o.datatype = 'uinteger';
        o.placeholder = '400';

        o = s.option(form.Value, 'host_max', _('Max destinations'), _('Destinations kept individually (minimum 20); idle ones are folded into "(other)" when the table is full.'));
        o.datatype = 'uinteger';
        o.placeholder = '200';

        o = s.option(form.Value, 'sock', _('netifyd socket'), _('Path of the netifyd JSON socket.'));
        o.placeholder = '/var/run/netifyd/netifyd.sock';
        o.depends('apps', '1');

        o = s.option(form.Value, 'agg_max_age', _('Stale threshold'), _('Seconds: aggregator data older than this is reported as stale on the chart page.'));
        o.datatype = 'uinteger';
        o.placeholder = '10';

        o = s.option(form.Value, 'cache_ttl_sec', _('Page cache'), _('Seconds the chart page data is cached (collapses several open tabs into one read).'));
        o.datatype = 'uinteger';
        o.placeholder = '1';

        return m.render();
    }
});
