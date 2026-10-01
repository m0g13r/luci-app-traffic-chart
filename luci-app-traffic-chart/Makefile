include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-traffic-chart
PKG_VERSION:=1.1.0
PKG_RELEASE:=12
PKG_LICENSE:=GPL-2.0-or-later
PKG_MAINTAINER:=m0g13r <155771712+m0g13r@users.noreply.github.com>

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-traffic-chart
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Live traffic chart (conntrack + shaper counters) with NSS SQM classifier
  DEPENDS:=+luci-base +rpcd +jsonfilter +ip-full +tc-tiny
  PKGARCH:=all
endef

define Package/luci-app-traffic-chart/description
  Live and historical traffic chart per application, device and destination.
  Reads conntrack and the qdisc counters, independent of the shaper in use.
  Optional: socat + netifyd (application names), conntrack (nss-trafficchart.qos),
  sqm-scripts (nss-trafficchart.qos itself).
endef

define Package/luci-app-traffic-chart/conffiles
/etc/config/trafficchart
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-traffic-chart/install
	$(INSTALL_DIR) $(1)/etc/init.d $(1)/etc/config
	$(INSTALL_BIN) ./files/etc/init.d/trafficchart $(1)/etc/init.d/trafficchart
	$(INSTALL_CONF) ./files/etc/config/trafficchart $(1)/etc/config/trafficchart
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/usr/libexec/trafficchart-* $(1)/usr/libexec/
	$(INSTALL_BIN) ./files/usr/libexec/rpcd/luci.trafficchart $(1)/usr/libexec/rpcd/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-traffic-chart.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-traffic-chart.json $(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/network
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/network/*.js $(1)/www/luci-static/resources/view/network/
	$(INSTALL_DIR) $(1)/usr/lib/sqm
	$(INSTALL_BIN) ./files/usr/lib/sqm/nss-trafficchart.qos $(1)/usr/lib/sqm/
	$(INSTALL_DATA) ./files/usr/lib/sqm/nss-trafficchart.qos.help $(1)/usr/lib/sqm/
endef

define Package/luci-app-traffic-chart/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/rpcd reload 2>/dev/null
	rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null
	/usr/libexec/trafficchart-migrate
	/etc/init.d/trafficchart enable
	/etc/init.d/trafficchart restart
}
exit 0
endef

define Package/luci-app-traffic-chart/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/trafficchart stop 2>/dev/null
	/etc/init.d/trafficchart disable 2>/dev/null
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-traffic-chart))
