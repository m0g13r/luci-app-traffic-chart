'use strict';
'require form';
'require view';

return view.extend({
    render: function() {
        var m, s, o;

        m = new form.Map('trafficchart', _('Traffic Chart'),
            _('Settings for the traffic-chart aggregator (trafficchart-agg). ' +
              'Saving restarts the aggregator (cumulative totals reset, the history survives).'));

        s = m.section(form.NamedSection, 'global', 'trafficchart', _('General'));

        o = s.option(form.Flag, 'enabled', _('Enable'), _('Disable to stop the aggregator entirely.'));
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'apps', _('Application names'), _('Run trafficchart-apps (netifyd) to label flows by application. Needs socat + netifyd. Without it flows are named by protocol and port.'));
        o.default = '1';
        o.depends('enabled', '1');

        o = s.option(form.ListValue, 'backend', _('Shaper backend'),
            _('Auto detects NSS hardware offload (nssifb) automatically.'));
        o.value('auto', _('Auto'));
        o.value('nss', _('NSS hardware offload'));
        o.value('generic', _('Generic (cake / htb+fq_codel / any other qdisc)'));
        o.default = 'auto';

        o = s.option(form.Value, 'interval', _('Poll interval'), _('Seconds between conntrack passes (default 4; stretches automatically under load).'));
        o.datatype = 'min(1)';
        o.placeholder = '4';

        o = s.option(form.Value, 'wan_dev', _('WAN device'),
            _('Empty = auto-detect (shaped devices are found in the kernel: ingress redirect to an ifb, or NSS nsstbl; otherwise the default route device). ' +
              'Set device names (e.g. eth1 pppoe-wan) or logical interfaces (wan), space separated, to override.'));
        o.placeholder = 'pppoe-wan';

        o = s.option(form.Flag, 'tooltips', _('Detailed tooltips'),
            _('Maintains the application x destination, destination x device and device x application tables that ' +
              'feed the "top destinations / devices / applications" tooltips of the live view. Costs CPU on every ' +
              'accounted flow delta. Disabling leaves the tooltips empty; totals and the History tab are not affected.'));
        o.default = '1';

        o = s.option(form.Value, 'l2_overhead', _('Link header size'),
            _('Bytes per packet the shaper counts but conntrack does not (used for "Not attributed"). "auto" measures it; ' +
              'or a fixed number: 14 Ethernet, 18 +VLAN, 22 +PPPoE, 26 +PPPoE+VLAN, 0 = no correction.'));
        o.placeholder = 'auto';

        o = s.option(form.Value, 'sock', _('netifyd socket'), _('Path of the netifyd JSON socket.'));
        o.validate = function(section_id, value) {
            if (value === null || value === '') return true;
            return /^\/var\/run\/netifyd\/[A-Za-z0-9._-]+\.sock$/.test(value)
                ? true
                : _('The socket must be a .sock file directly below /var/run/netifyd.');
        };
        o.placeholder = '/var/run/netifyd/netifyd.sock';
        o.depends('apps', '1');

        s = m.section(form.NamedSection, 'global', 'trafficchart', _('History and persistent storage'),
            _('The History tab keeps 5 minute buckets (24 hours), hourly buckets (week) and daily buckets (month, year). ' +
              'Without a storage path they live in RAM only and are lost on reboot.'));

        function validPaths(section_id, value) {
            if (value === null || value === '') return true;
            var ok = value.trim().split(/\s+/).every(function(w) { return w !== '/' && /^\/[A-Za-z0-9._\/-]+$/.test(w); });
            return ok ? true : _('Absolute paths, separated by spaces; only letters, digits and . _ - / are allowed.');
        }

        o = s.option(form.Value, 'persist_dir', _('Storage path(s)'),
            _('Directory (or several, separated by spaces) the history is saved to and reloaded from after a reboot; empty = RAM only. ' +
              'All available targets are written (mirrors); a missing one is caught up when it is back. About 1 MB per day. ' +
              'The router mounts nothing itself.'));
        o.placeholder = '/mnt/nas/traffic /mnt/sda1/trafficchart';
        o.rmempty = true;
        o.validate = validPaths;

        o = s.option(form.Value, 'persist_mount', _('Required mount point(s)'),
            _('Optional, separated by spaces: a target below one of these paths is only used while the path is mounted (e.g. /mnt/nas). ' +
              'Prevents the history from ending up on the flash below a share that is not mounted yet.'));
        o.placeholder = '/mnt/nas /mnt/sda1';
        o.rmempty = true;
        o.validate = validPaths;

        o = s.option(form.Value, 'persist_sec', _('Write interval'),
            _('Seconds between two writes to the storage (minimum 60). A clean stop, restart or reboot always writes everything.'));
        o.value('300', _('5 minutes'));
        o.value('900', _('15 minutes'));
        o.value('3600', _('1 hour (default)'));
        o.value('21600', _('6 hours'));
        o.datatype = 'range(60,604800)';
        o.placeholder = '3600';

        o = s.option(form.Value, 'persist_timeout', _('Access timeout'),
            _('Seconds an access to a target may take before it is given up (3-120). Use the "soft" mount option for network shares.'));
        o.datatype = 'range(3,120)';
        o.placeholder = '10';

        s = m.section(form.NamedSection, 'global', 'trafficchart', _('SQM classifier (nss-rk.qos)'),
            _('Optional extras of the nss-rk.qos nftables classifier (not used by the chart). All OFF by default. Restart SQM after changing them.'));

        o = s.option(form.Flag, 'dns_redirect', _('Redirect DNS to the router'),
            _('Redirects DNS (port 53, UDP and TCP) coming from every non-WAN interface to the router\'s own resolver. ' +
              'Also hits VPN interfaces and clients that use their own resolver - use the exclusion list below if that is not wanted.'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Value, 'dns_redirect_exclude', _('Interfaces excluded from the redirect'),
            _('Space separated device names (e.g. wg0 tun0) whose DNS is left alone.'));
        o.placeholder = 'wg0';
        o.depends('dns_redirect', '1');

        o = s.option(form.Flag, 'ttl_fix', _('Normalise TTL / hop limit'),
            _('Rewrites packets with TTL/hop limit 63 or 127 to 64.'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Flag, 'reset_ct_marks', _('Reset connection marks on SQM start'),
            _('Zeroes the whole conntrack mark when SQM starts. Turn it off if mwan3 (or anything else) keeps state in the higher mark bits.'));
        o.default = '1';
        o.rmempty = false;

        return m.render();
    }
});
