'use strict';
'require form';
'require view';

return view.extend({
    render: function() {
        var m, s, o;

        m = new form.Map('trafficchart', _('Traffic Chart'),
            _('Settings for the traffic-chart aggregator (trafficchart-agg) and the SQM traffic classes it shares with nss-rk.qos. ' +
              'Saving restarts the aggregator (cumulative totals reset, the 24 h history survives).'));

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

        o = s.option(form.Value, 'interval', _('Poll interval'), _('Seconds between conntrack passes (starting point; auto-stretches under load, see below).'));
        o.datatype = 'uinteger';
        o.placeholder = '2';

        o = s.option(form.Flag, 'adapt_interval', _('Adaptive interval'),
            _('Auto-stretch the poll interval once processing time grows into a meaningful share of the cycle, and ease it back down again.'));
        o.default = '1';

        o = s.option(form.Value, 'interval_max', _('Max interval'), _('Seconds: ceiling for the auto-stretched interval.'));
        o.datatype = 'uinteger';
        o.placeholder = '10';
        o.depends('adapt_interval', '1');

        o = s.option(form.Value, 'bulk_bytes', _('Bulk threshold'),
            _('Bytes: a WEB/P2P/BE flow above this size is shown as BULK. Shared with nss-rk.qos ' +
              '(restart SQM after changing this so the classifier picks it up too).'));
        o.datatype = 'uinteger';
        o.placeholder = '314572800';

        o = s.option(form.Value, 'hist_sec', _('History bucket length'), _('Seconds per 24h-history bucket.'));
        o.datatype = 'uinteger';
        o.placeholder = '300';

        o = s.option(form.Value, 'hist_keep', _('History buckets kept'), _('Number of buckets kept in RAM (default 288 x 300s = 24h). Lost on reboot.'));
        o.datatype = 'uinteger';
        o.placeholder = '288';

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

        s = m.section(form.TypedSection, 'trafficchart', _('Advanced'));
        s.anonymous = true;
        s.addremove = false;
        s.optional = true;

        o = s.option(form.Value, 'app_max', _('Max applications'), _('Applications kept individually; further ones are summed as "(other)".'));
        o.datatype = 'uinteger';
        o.placeholder = '400';

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
