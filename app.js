/**
 * Tizen TV 6.0 System Metrics & Resource Diagnostics
 */

(function () {
    'use strict';

    // State
    var isTizen = typeof window.tizen !== 'undefined' && typeof window.tizen.systeminfo !== 'undefined';
    var refreshInterval = null;
    var autoRefreshActive = true;
    var currentTab = 'metrics';

    // DOM Elements
    var cpuValueEl = document.getElementById('cpu-value');
    var cpuBarEl = document.getElementById('cpu-bar');
    var cpuStatusEl = document.getElementById('cpu-status');

    var memValueEl = document.getElementById('mem-value');
    var memBarEl = document.getElementById('mem-bar');
    var memStatusEl = document.getElementById('mem-status');
    var memTotalEl = document.getElementById('mem-total');

    var storageValueEl = document.getElementById('storage-value');
    var storageBarEl = document.getElementById('storage-bar');
    var storageStatusEl = document.getElementById('storage-status');
    var storageTotalEl = document.getElementById('storage-total');

    var netTypeEl = document.getElementById('net-type');
    var netIpEl = document.getElementById('net-ip');
    var netSubnetEl = document.getElementById('net-subnet');
    var netGatewayEl = document.getElementById('net-gateway');
    var netDnsEl = document.getElementById('net-dns');
    var netStatusEl = document.getElementById('net-status');

    var devModelEl = document.getElementById('dev-model');
    var devOsEl = document.getElementById('dev-os');
    var devResEl = document.getElementById('dev-res');
    var devArchEl = document.getElementById('dev-arch');

    var healthStatusEl = document.getElementById('health-status-text');
    var healthBadgeEl = document.getElementById('health-badge');
    var anomalyListEl = document.getElementById('anomaly-list');
    var lastUpdatedEl = document.getElementById('last-updated');

    var refreshBtn = document.getElementById('refresh-btn');
    var autoToggleBtn = document.getElementById('auto-toggle-btn');
    var tabMetricsBtn = document.getElementById('tab-metrics');
    var tabSecurityBtn = document.getElementById('tab-security');

    var metricsView = document.getElementById('metrics-view');
    var securityView = document.getElementById('security-view');

    // Metrics state cache for health computation
    var latestMetrics = {
        cpuLoad: 0,
        memStatus: 'NORMAL',
        totalMemory: 0,
        storageUsedPct: 0,
        netConnected: false,
        netIp: ''
    };

    /**
     * Initialize Application & Event Listeners
     */
    function init() {
        initRemoteKeys();
        setupEventListeners();
        fetchSystemMetrics();
        startAutoRefresh();
    }

    /**
     * Remote Control Navigation (Tizen TV Key Handler)
     */
    function initRemoteKeys() {
        // Register Tizen TV keys if API is available
        if (window.tizen && window.tizen.tvinputdevice) {
            try {
                tizen.tvinputdevice.registerKey('MediaPlayPause');
            } catch (e) {
                console.warn('Could not register TV media keys:', e);
            }
        }

        // Handle Return / Back key on TV remote
        window.addEventListener('tizenhwkey', function (e) {
            if (e.keyName === 'back') {
                try {
                    tizen.application.getCurrentApplication().exit();
                } catch (err) {
                    window.history.back();
                }
            }
        });

        // D-pad & Keyboard key navigation
        window.addEventListener('keydown', function (e) {
            var keyCode = e.keyCode;

            // 10009 is Tizen Return key
            if (keyCode === 10009 || keyCode === 27) {
                try {
                    if (window.tizen && tizen.application) {
                        tizen.application.getCurrentApplication().exit();
                    }
                } catch (err) {}
            }

            // Enter key on focused element
            if (keyCode === 13) {
                if (document.activeElement && typeof document.activeElement.click === 'function') {
                    document.activeElement.click();
                }
            }
        });
    }

    /**
     * Button & Tab Listeners
     */
    function setupEventListeners() {
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                fetchSystemMetrics();
            });
        }

        if (autoToggleBtn) {
            autoToggleBtn.addEventListener('click', function () {
                autoRefreshActive = !autoRefreshActive;
                if (autoRefreshActive) {
                    startAutoRefresh();
                    autoToggleBtn.innerText = 'Pause Auto-Refresh';
                } else {
                    stopAutoRefresh();
                    autoToggleBtn.innerText = 'Resume Auto-Refresh';
                }
            });
        }

        if (tabMetricsBtn && tabSecurityBtn) {
            tabMetricsBtn.addEventListener('click', function () {
                switchTab('metrics');
            });
            tabSecurityBtn.addEventListener('click', function () {
                switchTab('security');
            });
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        if (tab === 'metrics') {
            tabMetricsBtn.classList.add('selected');
            tabSecurityBtn.classList.remove('selected');
            metricsView.style.display = 'grid';
            securityView.style.display = 'none';
        } else {
            tabSecurityBtn.classList.add('selected');
            tabMetricsBtn.classList.remove('selected');
            metricsView.style.display = 'none';
            securityView.style.display = 'block';
        }
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshInterval = setInterval(fetchSystemMetrics, 3000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    /**
     * Fetch Metrics from Tizen Web Device API or Fallback Simulator
     */
    function fetchSystemMetrics() {
        var now = new Date();
        if (lastUpdatedEl) {
            lastUpdatedEl.innerText = now.toLocaleTimeString();
        }

        if (isTizen) {
            queryTizenApis();
        } else {
            simulateMetrics();
        }
    }

    /**
     * Query Real Tizen SystemInfo APIs
     */
    function queryTizenApis() {
        // 1. CPU
        try {
            tizen.systeminfo.getPropertyValue('CPU', function (cpu) {
                var load = Math.round((cpu.load || 0) * 100);
                latestMetrics.cpuLoad = load;
                updateCpuUI(load);
                updateHealthEvaluation();
            }, function (err) {
                console.warn('CPU error:', err);
            });
        } catch (e) {
            console.error('CPU call error:', e);
        }

        // 2. Total Memory & State
        try {
            tizen.systeminfo.getPropertyValue('TOTAL_MEMORY', function (mem) {
                var totalMb = Math.round(mem.totalMemory / (1024 * 1024));
                latestMetrics.totalMemory = totalMb;
                if (memTotalEl) memTotalEl.innerText = totalMb + ' MB';
            });

            tizen.systeminfo.getPropertyValue('MEMORY', function (memState) {
                var status = memState.status || 'NORMAL';
                latestMetrics.memStatus = status;
                updateMemoryUI(status);
                updateHealthEvaluation();
            });
        } catch (e) {
            console.error('Memory call error:', e);
        }

        // 3. Storage Units
        try {
            tizen.systeminfo.getPropertyValue('STORAGE', function (storage) {
                if (storage.units && storage.units.length > 0) {
                    var totalCap = 0;
                    var totalAvail = 0;
                    for (var i = 0; i < storage.units.length; i++) {
                        var unit = storage.units[i];
                        if (unit.type === 'INTERNAL') {
                            totalCap += unit.capacity;
                            totalAvail += unit.availableCapacity;
                        }
                    }
                    if (totalCap > 0) {
                        var usedCap = totalCap - totalAvail;
                        var usedPct = Math.round((usedCap / totalCap) * 100);
                        latestMetrics.storageUsedPct = usedPct;
                        updateStorageUI(usedPct, Math.round(totalCap / (1024 * 1024)), Math.round(totalAvail / (1024 * 1024)));
                        updateHealthEvaluation();
                    }
                }
            });
        } catch (e) {
            console.error('Storage call error:', e);
        }

        // 4. Network Status
        try {
            tizen.systeminfo.getPropertyValue('NETWORK', function (net) {
                var type = net.networkType || 'NONE';
                latestMetrics.netConnected = (type !== 'NONE' && type !== 'DISCONNECTED');
                latestMetrics.netIp = net.ipAddress || 'Unavailable';

                if (netTypeEl) netTypeEl.innerText = type;
                if (netIpEl) netIpEl.innerText = net.ipAddress || 'Not Assigned';
                if (netSubnetEl) netSubnetEl.innerText = net.subnetMask || '255.255.255.0';
                if (netGatewayEl) netGatewayEl.innerText = net.gateway || 'Unavailable';
                if (netDnsEl) netDnsEl.innerText = net.dns1 || (net.dns2 ? net.dns2 : 'Automatic');

                if (netStatusEl) {
                    if (latestMetrics.netConnected) {
                        netStatusEl.innerText = 'Connected';
                        netStatusEl.className = 'status-badge normal';
                    } else {
                        netStatusEl.innerText = 'Offline';
                        netStatusEl.className = 'status-badge critical';
                    }
                }
                updateHealthEvaluation();
            });
        } catch (e) {
            console.error('Network call error:', e);
        }

        // 5. Build, OS & Display Information
        try {
            tizen.systeminfo.getPropertyValue('BUILD', function (build) {
                if (devModelEl) devModelEl.innerText = build.model || 'Samsung Smart TV';
            });
            if (devOsEl) devOsEl.innerText = 'Tizen OS 6.0';

            tizen.systeminfo.getPropertyValue('DISPLAY', function (disp) {
                if (devResEl) devResEl.innerText = (disp.resolutionWidth || 1920) + ' x ' + (disp.resolutionHeight || 1080);
            });

            // Architecture capability
            try {
                var arch = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.core.cpu.arch');
                if (devArchEl) devArchEl.innerText = arch || 'ARM Cortex';
            } catch (e) {
                if (devArchEl) devArchEl.innerText = 'ARMv7/ARMv8';
            }
        } catch (e) {
            console.error('Build info error:', e);
        }
    }

    /**
     * Browser Fallback Simulation (Used for local PC testing)
     */
    function simulateMetrics() {
        // Simulated dynamic values
        var simulatedCpu = Math.min(100, Math.max(8, Math.floor(22 + (Math.random() * 24 - 10))));
        latestMetrics.cpuLoad = simulatedCpu;
        latestMetrics.memStatus = 'NORMAL';
        latestMetrics.totalMemory = 2048;
        latestMetrics.storageUsedPct = 48;
        latestMetrics.netConnected = true;
        latestMetrics.netIp = '192.168.1.145';

        updateCpuUI(simulatedCpu);
        updateMemoryUI('NORMAL');
        if (memTotalEl) memTotalEl.innerText = '2048 MB';
        updateStorageUI(48, 8192, 4260);

        if (netTypeEl) netTypeEl.innerText = 'WIFI';
        if (netIpEl) netIpEl.innerText = '192.168.1.145 (Simulated)';
        if (netSubnetEl) netSubnetEl.innerText = '255.255.255.0';
        if (netGatewayEl) netGatewayEl.innerText = '192.168.1.1';
        if (netDnsEl) netDnsEl.innerText = '192.168.1.1';
        if (netStatusEl) {
            netStatusEl.innerText = 'Connected';
            netStatusEl.className = 'status-badge normal';
        }

        if (devModelEl) devModelEl.innerText = 'Samsung Tizen TV (Emulator/Dev)';
        if (devOsEl) devOsEl.innerText = 'Tizen 6.0';
        if (devResEl) devResEl.innerText = window.innerWidth + ' x ' + window.innerHeight;
        if (devArchEl) devArchEl.innerText = 'ARM Cortex Quad-Core';

        updateHealthEvaluation();
    }

    /**
     * UI Update Helpers
     */
    function updateCpuUI(load) {
        if (!cpuValueEl || !cpuBarEl) return;
        cpuValueEl.innerHTML = load + '<span class="metric-unit">%</span>';
        cpuBarEl.style.width = Math.min(100, Math.max(0, load)) + '%';

        if (load > 85) {
            cpuBarEl.className = 'progress-bar warning';
            if (cpuStatusEl) {
                cpuStatusEl.innerText = 'HIGH';
                cpuStatusEl.className = 'status-badge critical';
            }
        } else if (load > 60) {
            cpuBarEl.className = 'progress-bar warning';
            if (cpuStatusEl) {
                cpuStatusEl.innerText = 'MODERATE';
                cpuStatusEl.className = 'status-badge warning';
            }
        } else {
            cpuBarEl.className = 'progress-bar';
            if (cpuStatusEl) {
                cpuStatusEl.innerText = 'OPTIMAL';
                cpuStatusEl.className = 'status-badge normal';
            }
        }
    }

    function updateMemoryUI(status) {
        if (!memValueEl || !memStatusEl || !memBarEl) return;
        memValueEl.innerText = status;

        if (status === 'CRITICAL') {
            memStatusEl.className = 'status-badge critical';
            memBarEl.style.width = '95%';
            memBarEl.className = 'progress-bar warning';
        } else if (status === 'LOW') {
            memStatusEl.className = 'status-badge warning';
            memBarEl.style.width = '78%';
            memBarEl.className = 'progress-bar warning';
        } else {
            memStatusEl.className = 'status-badge normal';
            memBarEl.style.width = '42%';
            memBarEl.className = 'progress-bar';
        }
    }

    function updateStorageUI(usedPct, totalMb, availMb) {
        if (!storageValueEl || !storageBarEl) return;
        storageValueEl.innerHTML = usedPct + '<span class="metric-unit">%</span>';
        storageBarEl.style.width = usedPct + '%';

        if (storageTotalEl) {
            storageTotalEl.innerText = (availMb / 1024).toFixed(1) + ' GB free of ' + (totalMb / 1024).toFixed(1) + ' GB';
        }

        if (usedPct > 90) {
            storageBarEl.className = 'progress-bar warning';
            if (storageStatusEl) {
                storageStatusEl.innerText = 'NEAR CAPACITY';
                storageStatusEl.className = 'status-badge critical';
            }
        } else {
            storageBarEl.className = 'progress-bar';
            if (storageStatusEl) {
                storageStatusEl.innerText = 'HEALTHY';
                storageStatusEl.className = 'status-badge normal';
            }
        }
    }

    /**
     * Compute Anomaly & System Health Checklist
     */
    function updateHealthEvaluation() {
        var anomalies = [];

        // Check CPU overload
        if (latestMetrics.cpuLoad >= 90) {
            anomalies.push({
                type: 'warning',
                title: 'High CPU Consumption (' + latestMetrics.cpuLoad + '%)',
                desc: 'A background web worker or heavy application is causing excessive processor load.'
            });
        }

        // Check Memory Status
        if (latestMetrics.memStatus === 'CRITICAL') {
            anomalies.push({
                type: 'critical',
                title: 'Critical Memory Exhaustion',
                desc: 'Available RAM is depleted. This may cause UI freezes, sluggish behavior, or app termination.'
            });
        } else if (latestMetrics.memStatus === 'LOW') {
            anomalies.push({
                type: 'warning',
                title: 'Low Memory Warning',
                desc: 'System memory is constrained. Consider closing running applications.'
            });
        }

        // Check Storage
        if (latestMetrics.storageUsedPct >= 92) {
            anomalies.push({
                type: 'critical',
                title: 'Internal Storage Nearly Full (' + latestMetrics.storageUsedPct + '%)',
                desc: 'Flash memory exhaustion can prevent system updates and trigger app crashes.'
            });
        }

        // Check Network
        if (!latestMetrics.netConnected) {
            anomalies.push({
                type: 'warning',
                title: 'Network Disconnected',
                desc: 'TV is not connected to a local Wi-Fi or Ethernet router.'
            });
        }

        // Update Health Banner
        if (healthStatusEl && healthBadgeEl) {
            if (anomalies.length === 0) {
                healthStatusEl.innerText = 'All System Metrics Normal & Stable';
                healthBadgeEl.innerText = 'System Healthy';
                healthBadgeEl.className = 'status-badge normal';
            } else {
                var hasCritical = anomalies.some(function (a) { return a.type === 'critical'; });
                if (hasCritical) {
                    healthStatusEl.innerText = 'System Bottleneck / Pressure Detected';
                    healthBadgeEl.innerText = 'Attention Required';
                    healthBadgeEl.className = 'status-badge critical';
                } else {
                    healthStatusEl.innerText = 'Moderate System Load Detected';
                    healthBadgeEl.innerText = 'Warning';
                    healthBadgeEl.className = 'status-badge warning';
                }
            }
        }

        // Render Anomaly Checklist
        if (anomalyListEl) {
            if (anomalies.length === 0) {
                anomalyListEl.innerHTML = '<div style="color: #34d399; font-size: 14px; padding: 10px 0;">✓ No resource leaks, storage saturation, or memory starvation detected.</div>';
            } else {
                var html = '';
                for (var i = 0; i < anomalies.length; i++) {
                    var item = anomalies[i];
                    var badgeColor = item.type === 'critical' ? 'critical' : 'warning';
                    html += '<div style="margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.25); border-radius: 8px;">' +
                                '<span class="status-badge ' + badgeColor + '">' + item.title + '</span>' +
                                '<p style="color: #9ca3af; font-size: 13px; margin-top: 6px;">' + item.desc + '</p>' +
                            '</div>';
                }
                anomalyListEl.innerHTML = html;
            }
        }
    }

    // Launch
    window.addEventListener('load', init);
})();
