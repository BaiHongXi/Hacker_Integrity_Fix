import { exec, spawn, toast } from "./assets/kernelsu.js";

let scriptOnly = false;
let shellRunning = false;
let initialPinchDistance = null;
let currentFontSize = 14;
let model = null, product = null;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

const spoofConfig = [
    { config: 'spoofBuild', label: '伪装设备构建信息', isAdvanced: false },
    { config: 'spoofVendingBuild', label: '伪装 Play Store 构建信息', isAdvanced: false },
    { config: 'spoofProps', label: '伪装设备属性', isAdvanced: true },
    { config: 'spoofProvider', label: '伪装内容提供商', isAdvanced: true },
    { config: 'spoofSignature', label: '伪装系统签名', isAdvanced: true },
    { config: 'spoofVendingSdk', label: '伪装 Play Store SDK', isAdvanced: true }
];

// 添加 spoofConfig 开关
function appendSpoofConfigToggles() {
    const advancedDiv = document.getElementById('advanced');
    const buttonBox = document.querySelector('.button-box');
    if (!buttonBox) return;

    spoofConfig.forEach((item, idx) => {
        const { config, label, isAdvanced } = item;
        const container = document.createElement('div');
        container.className = `toggle-list ripple-element${isAdvanced ? ' advanced-option' : ''}`;
        container.id = `${config}-container`;
        container.innerHTML = `
            <div class="toggle${idx === spoofConfig.length - 1 ? ' last-toggle' : ''}">
                <span class="toggle-text">${label}</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="${config}-toggle" disabled>
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        buttonBox.insertBefore(container, advancedDiv);
    });

    applyButtonEventListeners();
}

// 应用按钮事件监听器
function applyButtonEventListeners() {
    const fetchButton = document.getElementById('fetch');
    const viewButton = document.getElementById('view');
    const scriptOnlyToggle = document.getElementById('script-only-container');
    const advanced = document.getElementById('advanced');
    const clearButton = document.querySelector('.clear-terminal');
    const terminal = document.querySelector('.output-terminal-content');
    const githubBtn = document.getElementById('github-btn');

    fetchButton.addEventListener('click', runAction);
    viewButton.addEventListener('click', async () => {
        const result = await exec(`
            if [ -f /data/adb/pif.prop ]; then
                cat /data/adb/pif.prop
            else
                cat /data/adb/modules/playintegrityfix/pif.prop
            fi
        `);
        if (result.errno === 0) {
            const lines = result.stdout.split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => appendToOutput(line));
            appendToOutput("");
        } else {
            appendToOutput(`[!] 读取 pif.prop 失败: ${result.stderr}`, true);
        }
    });

    scriptOnlyToggle.addEventListener('click', async () => {
        await exec(`${scriptOnly ? 'rm -rf /data/adb/pif_script_only' : 'touch /data/adb/pif_script_only'} || true
            killall com.google.android.gms.unstable || true
            killall com.android.vending || true
        `);
        loadScriptOnlyConfig();
        appendToOutput(`[+] ${scriptOnly ? '已禁用' : '已启用'}仅脚本模式`);
    });

    advanced.addEventListener('click', () => {
        document.querySelectorAll('.advanced-option').forEach(option => {
            option.style.display = 'flex';
            option.offsetHeight;
            option.classList.add('advanced-show');
        });
        advanced.style.display = 'none';
    });

    clearButton.addEventListener('click', () => {
        terminal.innerHTML = '';
        currentFontSize = 14;
        updateFontSize(currentFontSize);
    });

    terminal.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
        }
    }, { passive: false });
    terminal.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches[0], e.touches[1]);
            
            if (initialPinchDistance === null) {
                initialPinchDistance = currentDistance;
                return;
            }

            const scale = currentDistance / initialPinchDistance;
            const newFontSize = currentFontSize * scale;
            updateFontSize(newFontSize);
            initialPinchDistance = currentDistance;
        }
    }, { passive: false });
    terminal.addEventListener('touchend', () => {
        initialPinchDistance = null;
    });

    githubBtn.onclick = () => {
        const link = "https://github.com/KOWX712/PlayIntegrityFix/releases/latest";
        toast("正在跳转到 " + link);
        setTimeout(() => {
            exec(`am start -a android.intent.action.VIEW -d ${link}`);
        }, 100);
    }
}

// 从 module.prop 加载版本信息
async function loadVersionFromModuleProp() {
    const versionElement = document.getElementById('version-text');
    const { errno, stdout, stderr } = await exec("grep '^version=' /data/adb/modules/playintegrityfix/module.prop | cut -d'=' -f2");
    if (errno === 0) {
        versionElement.textContent = stdout.trim();
    } else {
        appendToOutput(`[!] 从 module.prop 读取版本失败: ${stderr}`, true);
        console.error("从 module.prop 读取版本失败:", stderr);
    }
    checkDescription();
}

// 检查描述信息
async function checkDescription() {
    const unofficialOverlay = document.getElementById('unofficial-warning');
    const { errno } = await exec("grep -q 'tampered' /data/adb/modules/playintegrityfix/module.prop");
    if (typeof ksu !== 'undefined' && errno === 0) {
        unofficialOverlay.style.display = 'flex';
    }
}

// 加载 spoof 配置
async function loadSpoofConfig() {
    try {
        const { errno, stdout, stderr } = await exec(`
            if [ -f /data/adb/pif.prop ]; then
                cat /data/adb/pif.prop
            else
                cat /data/adb/modules/playintegrityfix/pif.prop
            fi
        `);
        if (errno !== 0) throw new Error(stderr);

        const pifMap = parsePropToMap(stdout);

        spoofConfig.forEach(item => {
            const toggle = document.getElementById(`${item.config}-toggle`);
            toggle.checked = pifMap[item.config];
        });

        if (model === null) model = pifMap.MODEL;
    } catch (error) {
        appendToOutput(`[!] 加载伪装配置失败: ${error}`, true);
        appendToOutput('[!] 警告：请勿使用第三方工具获取 pif.prop');
        resetPifProp();
        console.error(`加载伪装配置失败:`, error);
    }
}

// 重置 pif.prop 为默认值
function resetPifProp() {
    fetch('https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/inject_s/module/pif.prop')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态: ${response.status}`);
            }
            return response.text();
        })
        .then(async text => {
            const pifProp = text.trim();
            const { errno, stderr } = await exec(`
                echo '${pifProp}' > /data/adb/modules/playintegrityfix/pif.prop
                rm -f /data/adb/pif.prop || true
            `);
            if (errno === 0) {
                appendToOutput(`[+] 成功重置 pif.prop`);
            } else {
                appendToOutput(`[!] 重置 pif.prop 失败: ${stderr}`, true);
            }
        })
        .catch(error => {
            appendToOutput(`[!] 重置 pif.prop 失败: ${error.message}`);
        });
}

// 设置 spoof 配置按钮
function setupSpoofConfigButton() {
    spoofConfig.forEach(item => {
        const container = item.config + "-container";
        const toggle = document.getElementById(`${item.config}-toggle`);

        document.getElementById(container).addEventListener('click', async () => {
            if (shellRunning) return;
            muteToggle();
            const { errno, stdout, stderr } = await exec(`
                [ ! -f /data/adb/modules/playintegrityfix/pif.prop ] || echo "/data/adb/modules/playintegrityfix/pif.prop"
                [ ! -f /data/adb/pif.prop ] || echo "/data/adb/pif.prop"
            `);
            if (errno === 0) {
                const isSuccess = await updateSpoofConfig(toggle, item.config, stdout);
                if (isSuccess) {
                    loadSpoofConfig();
                    appendToOutput(`[+] ${toggle.checked ? "已禁用" : "已启用"} ${item.config}`);
                } else {
                    appendToOutput(`[!] ${toggle.checked ? "禁用" : "启用"} ${item.config} 失败`);
                }
                await exec(`
                    killall com.google.android.gms.unstable || true
                    killall com.android.vending || true
                `);
            } else {
                console.error(`查找 pif.prop 失败:`, stderr);
            }
            unmuteToggle();
        });
    });
}

/**
 * 更新 pif.prop
 * @param {HTMLInputElement} toggle - pif.prop 的配置开关
 * @param {string} type - 要更改的属性键
 * @param {string} pifFile - pif.prop 文件路径列表
 * @returns {Promise<boolean>}
 */
async function updateSpoofConfig(toggle, type, pifFile) {
    let isSuccess = true;
    const files = pifFile.split('\n').filter(line => line.trim() !== '');
    
    for (const pifFile of files) {
        try {
            // 读取
            const { stdout } = await exec(`cat ${pifFile}`);
            const config = parsePropToMap(stdout);

            // 更新字段
            config[type] = !toggle.checked;
            const prop = parseMapToProp(config);

            // 写入
            const { errno } = await exec(`echo '${prop}' > ${pifFile}`);
            if (errno !== 0) isSuccess = false;

            // 提醒
            if (config.spoofVendingBuild && config.spoofVendingSdk) {
                appendToOutput('[!] 当 spoofVendingBuild 启用时，spoofVendingSdk 将不会生效');
            }

            // 提醒
            const signature = await exec('unzip -l /system/etc/security/otacerts.zip | grep -oE "testkey|releasekey"');
            if (signature.errno === 0) {
                if (signature.stdout.trim() === "testkey" && !config.spoofSignature) {
                    appendToOutput('[!] 检测到未签名的 ROM，请启用 spoofSignature 来修复');
                } else if (signature.stdout.trim() === "releasekey" && config.spoofSignature) {
                    appendToOutput('[+] 检测到已签名的 ROM，启用 spoofSignature 可能没有用处');
                }
            }
        } catch (error) {
            console.error(`更新 ${pifFile} 失败:`, error);
            isSuccess = false;
        }
    }
    return isSuccess;
}

// 在输出终端中添加内容
function appendToOutput(content, error = false) {
    const output = document.querySelector('.output-terminal-content');
    if (content.trim() === "") {
        const lineBreak = document.createElement('br');
        output.appendChild(lineBreak);
    } else {
        const line = document.createElement('p');
        line.className = 'output-content';
        line.innerHTML = content.replace(/ /g, '&nbsp;');
        if (error) line.style.color = 'red';
        output.appendChild(line);
    }
    output.scrollTop = output.scrollHeight;
}

// 运行脚本并显示输出
function runAction() {
    if (shellRunning) return;
    muteToggle();
    let opts = {};
    if (model && product) opts = { env: { MODEL: `"${model}"`, PRODUCT: `"${product}"`} };
    const scriptOutput = spawn("sh", ["/data/adb/modules/playintegrityfix/autopif.sh"], opts);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(`[!] 执行 autopif.sh 时出错: ${data}`, true));
    scriptOutput.on('exit', () => {
        appendToOutput("");
        unmuteToggle();
    });
    scriptOutput.on('error', () => {
        appendToOutput("[!] 错误：无法执行 autopif.sh", true);
        appendToOutput("");
        unmuteToggle();
    });
}

function updateAutopif() {
    muteToggle();
    const scriptOutput = spawn("sh", ["/data/adb/modules/playintegrityfix/autopif_ota.sh"]);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(`[!] 执行 autopif_ota.sh 时出错: ${data}`, true));
    scriptOutput.on('exit', () => {
        unmuteToggle();
    });
    scriptOutput.on('error', () => {
        appendToOutput("[!] 错误：无法执行 autopif_ota.sh", true);
        appendToOutput("");
        unmuteToggle();
    });
}

function muteToggle() {
    shellRunning = true;
    document.querySelectorAll('.toggle-list').forEach(toggle => {
        toggle.classList.add('toggle-muted');
    });
}

function unmuteToggle() {
    shellRunning = false;
    document.querySelectorAll('.toggle-list').forEach(toggle => {
        toggle.classList.remove('toggle-muted');
    });
}

/**
 * 解析属性为映射
 * @param {string} prop - 属性字符串
 * @returns {Object} - 属性映射
 */
function parsePropToMap(prop) {
    const map = {};
    if (!prop || typeof prop !== 'string') return map;
    const lines = prop.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (value === 'true' || value === 'false') value = value === 'true';
        else if (/^\d+$/.test(value)) value = parseInt(value, 10);
        else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
        map[key] = value;
    }
    return map;
}

/**
 * 解析映射为属性
 * @param {Object} map - 属性映射
 * @returns {string} - 属性字符串
 */
function parseMapToProp(map) {
    if (!map || typeof map !== 'object') return '';
    return Object.entries(map)
        .map(([key, value]) => {
            if (typeof value === 'boolean') return `${key}=${value ? 'true' : 'false'}`;
            return `${key}=${value}`;
        })
        .join('\n');
}

/**
 * 模拟 MD3 涟漪动画
 * 用法：class="ripple-element" style="position: relative; overflow: hidden;"
 * 注意：需要设置背景颜色才能正常工作
 * @return {void}
 */
function applyRippleEffect() {
    document.querySelectorAll('.ripple-element').forEach(element => {
        if (element.dataset.rippleListener !== "true") {
            element.addEventListener("pointerdown", async (event) => {
                // 指针抬起事件
                const handlePointerUp = () => {
                    ripple.classList.add("end");
                    setTimeout(() => {
                        ripple.classList.remove("end");
                        ripple.remove();
                    }, duration * 1000);
                    element.removeEventListener("pointerup", handlePointerUp);
                    element.removeEventListener("pointercancel", handlePointerUp);
                };
                element.addEventListener("pointerup", handlePointerUp);
                element.addEventListener("pointercancel", handlePointerUp);

                const ripple = document.createElement("span");
                ripple.classList.add("ripple");

                // 计算涟漪大小和位置
                const rect = element.getBoundingClientRect();
                const width = rect.width;
                const size = Math.max(rect.width, rect.height);
                const x = event.clientX - rect.left - size / 2;
                const y = event.clientY - rect.top - size / 2;

                // 确定动画持续时间
                let duration = 0.2 + (width / 800) * 0.4;
                duration = Math.min(0.8, Math.max(0.2, duration));

                // 设置涟漪样式
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${x}px`;
                ripple.style.top = `${y}px`;
                ripple.style.animationDuration = `${duration}s`;
                ripple.style.transition = `opacity ${duration}s ease`;

                // 自适应颜色
                const computedStyle = window.getComputedStyle(element);
                const bgColor = computedStyle.backgroundColor || "rgba(0, 0, 0, 0)";
                const isDarkColor = (color) => {
                    const rgb = color.match(/\d+/g);
                    if (!rgb) return false;
                    const [r, g, b] = rgb.map(Number);
                    return (r * 0.299 + g * 0.587 + b * 0.114) < 96; // 亮度公式
                };
                ripple.style.backgroundColor = isDarkColor(bgColor) ? "rgba(255, 255, 255, 0.2)" : "";

                // 添加涟漪
                element.appendChild(ripple);
            });
            element.dataset.rippleListener = "true";
        }
    });
}

// 检查是否在 MMRL 中运行
async function checkMMRL() {
    if (typeof ksu !== 'undefined' && ksu.mmrl) {
        // 根据设备主题设置状态栏主题
        try {
            $playintegrityfix.setLightStatusBars(!window.matchMedia('(prefers-color-scheme: dark)').matches)
        } catch (error) {
            console.log("设置状态栏主题时出错:", error)
        }
    }
}

function loadScriptOnlyConfig() {
    exec('[ -e "/data/adb/pif_script_only" ]')
        .then(({ errno }) => {
            scriptOnly = errno === 0;
            document.querySelectorAll('.toggle-list').forEach(toggle => {
                if (toggle.classList.contains('advanced-option')
                    && !toggle.classList.contains('advanced-show')
                    || toggle.classList.contains('script-only')
                ) return;
                toggle.style.display = scriptOnly ? 'none' : 'flex';
            });

            const scriptOnlyContainer = document.getElementById('script-only-container');
            scriptOnlyContainer.querySelector('input[type=checkbox]').checked = scriptOnly
            scriptOnlyContainer.querySelector('.toggle').classList.toggle('last-toggle', scriptOnly);
            scriptOnlyContainer.querySelector('.toggle').classList.toggle('first-toggle', scriptOnly);
        });
}

/**
 * 获取可用型号和产品数组，如果上次更新在1天内，则从本地存储检索
 * @returns {Object} - 包含型号数组和产品数组的对象
 */
function getDeviceList() {
    const cacheKey = 'PIF_devices_list';
    const tsKey = 'PIF_devices_list_timestamp';
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cachedList = localStorage.getItem(cacheKey);
    let cachedTs = localStorage.getItem(tsKey);

    return new Promise(async (resolve) => {
        if (cachedList && cachedTs && (now - parseInt(cachedTs, 10) < oneDayMs)) {
            try {
                resolve(JSON.parse(cachedList));
                return;
            } catch (e) {
                // 如果解析失败则回退到刷新
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        let listJson = "";
        const result = spawn('sh', ["/data/adb/modules/playintegrityfix/autopif.sh", "--list"]);
        result.stdout.on('data', (data) => {
            if (data.trim() === "" || data.startsWith('[')) return;
            listJson += data.trim();
        });
        result.on('exit', () => {
            if (listJson !== "") {
                localStorage.setItem(cacheKey, listJson);
                localStorage.setItem(tsKey, String(Date.now()));
                try {
                    resolve(JSON.parse(listJson));
                } catch (e) {
                    appendToOutput(`[!] 解析设备列表时出错: ${e}`, true);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    });
}

let selectorListener = false;

// 将可用设备列表渲染到选择菜单
function setupDeviceList() {
    const selectMenu = document.getElementById('select-devices');

    if (!selectorListener) {
        selectMenu.addEventListener('change', () => {
            if (selectMenu.value === 'refresh') {
                localStorage.removeItem('PIF_devices_list');
                localStorage.removeItem('PIF_devices_list_timestamp');
                selectMenu.innerHTML = '<option value=loading>正在加载</option>';
                selectMenu.value = 'loading'
                setupDeviceList();
                return;
            }

            const selected = selectMenu.options[selectMenu.selectedIndex];
            model = selected.value || null;
            product = selected.getAttribute('data-product') || null;
        });
        selectorListener = true;
    }

    // 渲染设备列表
    getDeviceList().then(deviceList => {
        selectMenu.innerHTML = `
            <option value="random">随机</option>
            <option value="refresh">刷新列表</option>
        `;

        if (!deviceList || !deviceList.model || !deviceList.product) return;
        for (let i = 0; i < deviceList.model.length; i++) {
            const option = document.createElement('option');
            option.value = deviceList.model[i];
            option.textContent = deviceList.model[i];
            option.setAttribute('data-product', deviceList.product[i] || '');
            selectMenu.appendChild(option);
        }

        // 选择之前的型号
        if (model && deviceList.model.includes(model)) {
            selectMenu.value = model;
            selectMenu.dispatchEvent(new Event('change'));
        }
    });
}

function getDistance(touch1, touch2) {
    return Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
    );
}

function updateFontSize(newSize) {
    currentFontSize = Math.min(Math.max(newSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
    const terminal = document.querySelector('.output-terminal-content');
    terminal.style.fontSize = `${currentFontSize}px`;
}

document.addEventListener('DOMContentLoaded', async () => {
    checkMMRL();
    appendSpoofConfigToggles();
    loadVersionFromModuleProp();
    await loadSpoofConfig();
    setupSpoofConfigButton();
    loadScriptOnlyConfig();
    setupDeviceList();
    applyRippleEffect();
    updateAutopif();
});
