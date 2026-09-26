/**
 * Dr. Alaa Al-Kubaisi Clinic - Interactive Animations
 * All animations run at 60fps using GPU-accelerated transforms
 */

(function() {
    'use strict';

    // ===== CHECK FOR REDUCED MOTION =====
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== ANIMATED GRADIENT MESH BACKGROUND =====
    function initBackground() {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;

        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            // Fallback: CSS gradient
            canvas.style.background = 'linear-gradient(135deg, #f8f9ff 0%, #e0f2fe 50%, #f8f9ff 100%)';
            return;
        }

        let width, height;
        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
        window.addEventListener('resize', resize);
        resize();

        const vertexShaderSource = `
            attribute vec2 position;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(position, 0.0, 1.0);
                v_texCoord = position * 0.5 + 0.5;
            }
        `;

        const fragmentShaderSource = `
            precision highp float;
            varying vec2 v_texCoord;
            uniform float u_time;
            uniform vec2 u_resolution;

            // Simplex-like noise
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                vec2 shift = vec2(100.0);
                mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.0 + shift;
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec2 uv = v_texCoord;
                float t = u_time * 0.08;

                // Subtle gradient mesh - breathing blobs
                float n1 = fbm(uv * 2.0 + vec2(t * 0.3, t * 0.2));
                float n2 = fbm(uv * 1.5 + vec2(-t * 0.2, t * 0.15) + 5.0);
                float n3 = fbm(uv * 1.8 + vec2(t * 0.1, -t * 0.25) + 10.0);

                // Medical blue and golden palette - very subtle
                vec3 base = vec3(0.973, 0.976, 1.0);      // #F8FAFC
                vec3 blueBlob = vec3(0.878, 0.933, 1.0);    // Soft medical blue
                vec3 goldBlob = vec3(0.976, 0.961, 0.906);  // Soft golden
                vec3 whiteBlob = vec3(1.0, 1.0, 1.0);       // Pure white

                float mask1 = smoothstep(0.3, 0.7, n1);
                float mask2 = smoothstep(0.35, 0.65, n2);
                float mask3 = smoothstep(0.4, 0.6, n3);

                vec3 color = base;
                color = mix(color, blueBlob, mask1 * 0.35);
                color = mix(color, goldBlob, mask2 * 0.2);
                color = mix(color, whiteBlob, mask3 * 0.15);

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        function createShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            canvas.style.background = 'linear-gradient(135deg, #f8f9ff 0%, #e0f2fe 50%, #f8f9ff 100%)';
            return;
        }

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return;
        }

        gl.useProgram(program);

        const vertices = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const timeLocation = gl.getUniformLocation(program, 'u_time');
        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

        const startTime = Date.now();

        function render() {
            const currentTime = (Date.now() - startTime) / 1000.0;
            gl.uniform1f(timeLocation, currentTime);
            gl.uniform2f(resolutionLocation, width, height);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }

        render();
    }

    // ===== HERO CINEMATIC SMOKE (CANVAS 2D) =====
    /*
     * Elegant, clearly-visible animated mist behind all hero content
     * (z-index 0, under .hero-inner). Painted with Canvas 2D - not WebGL -
     * so it runs everywhere, including browsers/GPUs without WebGL support.
     *
     * - Soft by construction: drawn at a reduced internal resolution and
     *   stretched up by CSS, using only huge radial-gradient mist clouds
     *   (white / soft light blue). No dots, no particles, no circles, no
     *   hard edges, no sharp shapes.
     * - Clouds drift and breathe on slow, phase-offset sinusoids, so the
     *   motion is smooth, organic and never visibly loops.
     * - Cheap: ~6 radial-gradient fills per frame on a small buffer.
     * - Pauses while the tab is hidden or the hero is off-screen.
     * - Respects prefers-reduced-motion (one static mist frame, no loop).
     */
    function initHeroSmoke() {
        var canvas = document.querySelector('.hero-mist .hero-smoke');
        if (!canvas) return;

        var wrapper = canvas.parentElement;
        var ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;

        // Internal resolution budget (px along the longest hero side).
        // Higher = a touch sharper, lower = fuzzier and faster.
        var budget = coarse ? 300 : 520;

        var width = 0;
        var height = 0;

        function resize() {
            var rect = wrapper.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var scale = Math.min(1, budget / Math.max(rect.width, rect.height));
            var w = Math.max(2, Math.round(rect.width * scale));
            var h = Math.max(2, Math.round(rect.height * scale));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            width = w;
            height = h;
        }
        resize();

        // Mist clouds. (x, y) center, r radius, s vertical stretch as
        // fractions of the hero. vx/vy = drift rates, ax/ay = sway
        // amplitude, bp = breathing rate, ba = breath amount, ap = alpha
        // oscillation rate, ph = per-cloud phase (keeps them unsynchronised).
        // Colors: white and very light medical blues.
        var clouds = coarse ? [
            { x: 0.30, y: 0.28, r: 0.52, s: 1.06, a: 0.14, c: [205, 227, 250], vx: 0.016, vy: 0.010, ax: 0.055, ay: 0.040, bp: 0.085, ba: 0.10, ap: 0.060, ph: 1.1 },
            { x: 0.70, y: 0.30, r: 0.56, s: 0.92, a: 0.16, c: [188, 216, 246], vx: -0.014, vy: 0.012, ax: 0.045, ay: 0.050, bp: 0.100, ba: 0.08, ap: 0.075, ph: 3.4 },
            { x: 0.50, y: 0.74, r: 0.62, s: 1.00, a: 0.12, c: [226, 238, 252], vx: 0.012, vy: -0.009, ax: 0.050, ay: 0.035, bp: 0.070, ba: 0.12, ap: 0.050, ph: 5.2 },
            { x: 0.18, y: 0.78, r: 0.50, s: 1.12, a: 0.10, c: [213, 231, 251], vx: 0.020, vy: 0.008, ax: 0.040, ay: 0.045, bp: 0.095, ba: 0.09, ap: 0.068, ph: 2.2 }
        ] : [
            { x: 0.26, y: 0.20, r: 0.44, s: 1.05, a: 0.085, c: [255, 255, 255], vx: 0.009, vy: 0.014, ax: 0.050, ay: 0.035, bp: 0.070, ba: 0.08, ap: 0.055, ph: 0.6 },
            { x: 0.52, y: 0.42, r: 0.46, s: 1.02, a: 0.115, c: [205, 227, 250], vx: -0.011, vy: 0.006, ax: 0.045, ay: 0.030, bp: 0.100, ba: 0.09, ap: 0.070, ph: 1.9 },
            { x: 0.66, y: 0.26, r: 0.50, s: 0.88, a: 0.125, c: [188, 216, 246], vx: 0.013, vy: -0.008, ax: 0.040, ay: 0.042, bp: 0.082, ba: 0.10, ap: 0.062, ph: 3.8 },
            { x: 0.83, y: 0.13, r: 0.36, s: 1.12, a: 0.095, c: [224, 238, 252], vx: -0.008, vy: 0.012, ax: 0.038, ay: 0.030, bp: 0.090, ba: 0.08, ap: 0.048, ph: 5.6 },
            { x: 0.20, y: 0.60, r: 0.42, s: 1.16, a: 0.085, c: [210, 230, 250], vx: 0.017, vy: 0.010, ax: 0.048, ay: 0.040, bp: 0.068, ba: 0.11, ap: 0.058, ph: 2.6 },
            { x: 0.50, y: 0.88, r: 0.46, s: 1.00, a: 0.090, c: [255, 255, 255], vx: 0.010, vy: -0.006, ax: 0.042, ay: 0.036, bp: 0.095, ba: 0.09, ap: 0.072, ph: 4.4 }
        ];

        function paint(t) {
            ctx.clearRect(0, 0, width, height);
            for (var i = 0; i < clouds.length; i++) {
                var c = clouds[i];
                var swayX = Math.sin(t * c.vx + c.ph) * c.ax * width;
                var swayY = Math.cos(t * c.vy + c.ph * 1.303) * c.ay * height;
                var cx = c.x * width + swayX;
                var cy = c.y * height + swayY;
                var rad = Math.max(8, c.r * width * (1 + Math.sin(t * c.bp + c.ph) * c.ba));
                var alpha = c.a * (1 + Math.sin(t * c.ap + c.ph * 0.5) * 0.30);

                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(1, c.s);
                var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
                g.addColorStop(0,    'rgba(' + c.c[0] + ',' + c.c[1] + ',' + c.c[2] + ',' + alpha.toFixed(3) + ')');
                g.addColorStop(0.55, 'rgba(' + c.c[0] + ',' + c.c[1] + ',' + c.c[2] + ',' + (alpha * 0.50).toFixed(3) + ')');
                g.addColorStop(1,    'rgba(' + c.c[0] + ',' + c.c[1] + ',' + c.c[2] + ',0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(0, 0, rad, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Reduced motion: one calm static mist frame, no animation loop.
        if (prefersReducedMotion) {
            paint(23.0);
            window.addEventListener('resize', resize, { passive: true });
            return;
        }

        var docVisible = true;
        document.addEventListener('visibilitychange', function() {
            docVisible = !document.hidden;
        });

        var inView = true;
        if ('IntersectionObserver' in window) {
            try {
                new IntersectionObserver(function(entries) {
                    inView = entries[0].isIntersecting;
                }, { rootMargin: '0px' }).observe(wrapper);
            } catch (e) { /* observer unsupported - keep animating */ }
        }

        // Adaptive quality: drop the internal resolution once if the loop
        // is running below roughly 22fps for a while.
        var degraded = false;
        var slowCount = 0;
        var lastFrame = 0;

        function frame(nowMs) {
            requestAnimationFrame(frame);

            if (!degraded && lastFrame) {
                var dt = nowMs - lastFrame;
                if (dt > 45) { slowCount += (dt > 70 ? 2 : 1); }
                else { slowCount = Math.max(0, slowCount - 1); }
                if (slowCount > 60) {
                    degraded = true;
                    budget = Math.max(170, Math.round(budget * 0.65));
                    resize();
                }
            }
            lastFrame = nowMs;

            if (!docVisible || !inView) return;
            paint(nowMs / 1000);
        }
        requestAnimationFrame(frame);
        window.addEventListener('resize', resize, { passive: true });
    }


    // ===== NAVBAR SCROLL EFFECT =====
    function initNavbar() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;

        let lastScroll = 0;

        window.addEventListener('scroll', function() {
            const scrollY = window.scrollY;
            if (scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
            lastScroll = scrollY;
        }, { passive: true });
    }

    // ===== MOBILE MENU =====
    function initMobileMenu() {
        const btn = document.getElementById('mobile-menu-btn');
        const menu = document.getElementById('mobile-menu');
        if (!btn || !menu) return;

        function syncState() {
            const open = menu.classList.contains('open');
            btn.classList.toggle('menu-open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
            menu.setAttribute('aria-hidden', open ? 'false' : 'true');
            document.body.classList.toggle('menu-open', open);
        }

        function openMenu() {
            menu.classList.add('open');
            syncState();
        }

        function closeMenu() {
            menu.classList.remove('open');
            syncState();
        }

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (menu.classList.contains('open')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Close on link click
        menu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', closeMenu);
        });

        // Close on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && menu.classList.contains('open')) {
                closeMenu();
                btn.focus();
            }
        });

        // Close on outside click / tap
        document.addEventListener('click', function(e) {
            if (!menu.classList.contains('open')) return;
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                closeMenu();
            }
        });

        // Close when resized to desktop
        window.addEventListener('resize', function() {
            if (window.innerWidth >= 1024 && menu.classList.contains('open')) {
                closeMenu();
            }
        });

        syncState();
    }

    // ===== HERO ANIMATIONS =====
    function initHeroAnimations() {
        const hero = document.querySelector('.hero');
        if (!hero) return;

        if (prefersReducedMotion) {
            hero.classList.add('animate-in');
            return;
        }

        // Trigger on load with slight delay
        setTimeout(function() {
            hero.classList.add('animate-in');
        }, 200);
    }

    // ===== SCROLL REVEAL (Intersection Observer) =====
    function initScrollReveal() {
        if (prefersReducedMotion) {
            document.querySelectorAll('.scroll-reveal').forEach(function(el) {
                el.classList.add('revealed');
            });
            return;
        }

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.scroll-reveal').forEach(function(el) {
            observer.observe(el);
        });
    }

    // ===== TIMELINE DRAW LINE =====
    function initTimeline() {
        const timelineLine = document.getElementById('timeline-line');
        const timelineItems = document.querySelectorAll('.timeline-item');
        if (!timelineLine || timelineItems.length === 0) return;

        if (prefersReducedMotion) {
            timelineLine.classList.add('drawn');
            timelineItems.forEach(function(item) { item.classList.add('visible'); });
            return;
        }

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    // Draw the line
                    timelineLine.classList.add('drawn');

                    // Reveal items with stagger
                    timelineItems.forEach(function(item, index) {
                        setTimeout(function() {
                            item.classList.add('visible');
                        }, 400 + index * 300);
                    });

                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        observer.observe(timelineLine.parentElement);
    }

    // ===== DOCTOR PORTRAIT PARALLAX =====
    function initPortraitParallax() {
        if (prefersReducedMotion) return;

        const portrait = document.getElementById('doctor-portrait');
        if (!portrait) return;

        document.addEventListener('mousemove', function(e) {
            const rect = portrait.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const deltaX = (e.clientX - centerX) / window.innerWidth;
            const deltaY = (e.clientY - centerY) / window.innerHeight;

            // Very subtle movement (max 5px)
            const moveX = -deltaX * 5;
            const moveY = -deltaY * 5;

            requestAnimationFrame(function() {
                portrait.style.transform = 'translateY(' + (-10 + moveY) + 'px) translateX(' + moveX + 'px)';
            });
        });
    }

    // ===== FAQ ACCORDION =====
    window.toggleFaq = function(el) {
        const item = el.closest('.faq-item');
        if (!item) return;

        const isOpen = item.classList.contains('open');

        // Close all
        document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
            openItem.classList.remove('open');
            const btn = openItem.querySelector('.faq-question');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        // Toggle clicked
        if (!isOpen) {
            item.classList.add('open');
            el.setAttribute('aria-expanded', 'true');
        }
    };

    // ===== BOOKING MODAL =====
    var WHATSAPP_NUMBER = '9647878449990';
    var bookingFocusReturn = null;

    function todayLocal() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function formatDateForMessage(iso) {
        var parts = iso.split('-');
        if (parts.length !== 3) return iso;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function normalizePhone(raw) {
        return (raw || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function(c) {
            var code = c.charCodeAt(0);
            var base = (code >= 0x0660 && code <= 0x0669) ? 0x0660 : 0x06F0;
            return String.fromCharCode(code - base + 0x30);
        });
    }

    function digitsOnly(raw) {
        return normalizePhone(raw).replace(/[^\d]/g, '');
    }

    function setFieldError(fieldId, valid) {
        var field = document.getElementById(fieldId);
        var group = field ? field.closest('.form-group') : null;
        if (group) group.classList.toggle('invalid', !valid);
    }

    function showFormError(message) {
        var errorEl = document.getElementById('booking-error');
        if (errorEl) {
            errorEl.textContent = message || '';
            errorEl.classList.toggle('show', !!message);
        }
    }

    function clearBookingErrors() {
        showFormError('');
        document.querySelectorAll('#booking-modal .form-group.invalid').forEach(function(group) {
            group.classList.remove('invalid');
        });
    }

    function validateBooking() {
        var name = document.getElementById('booking-name').value.trim();
        var phoneRaw = document.getElementById('booking-phone').value.trim();
        var service = document.getElementById('booking-service').value;
        var date = document.getElementById('booking-date').value;

        if (name.length < 2) {
            setFieldError('booking-name', false);
            return { ok: false, message: 'يرجى إدخال الاسم الكامل.' };
        }
        setFieldError('booking-name', true);

        var phoneDigits = digitsOnly(phoneRaw);
        var phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15
            && (phoneDigits.charAt(0) === '7' || phoneDigits.charAt(0) === '0');
        if (!phoneValid) {
            setFieldError('booking-phone', false);
            return { ok: false, message: 'يرجى إدخال رقم هاتف صحيح (مثال: 07XXXXXXXXX).' };
        }
        setFieldError('booking-phone', true);

        if (!service) {
            setFieldError('booking-service', false);
            return { ok: false, message: 'يرجى اختيار الخدمة المطلوبة.' };
        }
        setFieldError('booking-service', true);

        if (!date) {
            setFieldError('booking-date', false);
            return { ok: false, message: 'يرجى اختيار تاريخ الحجز.' };
        }
        if (date < todayLocal()) {
            setFieldError('booking-date', false);
            return { ok: false, message: 'لا يمكن الحجز في تاريخ سابق، يرجى اختيار تاريخ اليوم أو لاحقاً.' };
        }
        setFieldError('booking-date', true);

        return { ok: true };
    }

    window.openBooking = function(e) {
        if (e) e.preventDefault();
        var modal = document.getElementById('booking-modal');
        if (!modal || modal.classList.contains('open')) return;

        bookingFocusReturn = document.activeElement;

        var dateInput = document.getElementById('booking-date');
        if (dateInput) {
            dateInput.min = todayLocal();
            if (dateInput.value && dateInput.value < dateInput.min) dateInput.value = '';
        }

        clearBookingErrors();

        var submitBtn = document.getElementById('booking-submit');
        if (submitBtn) submitBtn.disabled = false;

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        var firstInput = document.getElementById('booking-name');
        if (firstInput) setTimeout(function() { firstInput.focus(); }, 50);
    };

    window.closeBooking = function() {
        var modal = document.getElementById('booking-modal');
        if (!modal || !modal.classList.contains('open')) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        clearBookingErrors();
        if (bookingFocusReturn && typeof bookingFocusReturn.focus === 'function') {
            bookingFocusReturn.focus();
            bookingFocusReturn = null;
        }
    };

    window.submitBooking = function(e) {
        if (e) e.preventDefault();

        var submitBtn = document.getElementById('booking-submit');
        if (submitBtn && submitBtn.disabled) return false;

        if (submitBtn) submitBtn.disabled = true;

        var result = validateBooking();
        if (!result.ok) {
            if (submitBtn) submitBtn.disabled = false;
            showFormError(result.message);
            var firstInvalid = document.querySelector('#booking-modal .form-group.invalid input, #booking-modal .form-group.invalid select');
            if (firstInvalid) firstInvalid.focus();
            return false;
        }

        var name = document.getElementById('booking-name').value.trim();
        var phone = document.getElementById('booking-phone').value.trim();
        var service = document.getElementById('booking-service').value;
        var date = document.getElementById('booking-date').value;
        var notes = document.getElementById('booking-notes').value.trim();

        var lines = [
            'مرحباً د. آلاء،',
            'أرغب بحجز موعد:',
            '',
            'الاسم: ' + name,
            'الهاتف: ' + phone,
            'الخدمة: ' + service,
            'التاريخ: ' + formatDateForMessage(date)
        ];
        if (notes) lines.push('ملاحظات: ' + notes);
        lines.push('', 'تم الإرسال من موقع العيادة الإلكتروني.');

        var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
        window.open(url, '_blank', 'noopener');

        window.closeBooking();
        return false;
    };

    document.addEventListener('keydown', function(e) {
        var modal = document.getElementById('booking-modal');
        if (e.key === 'Escape') {
            if (modal && modal.classList.contains('open')) {
                closeBooking();
            }
            return;
        }

        if (e.key === 'Tab' && modal && modal.classList.contains('open')) {
            var focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (!focusables.length) return;
            var first = focusables[0];
            var last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    // ===== GALLERY LIGHTBOX =====
    function initLightbox() {
        var overlay = document.getElementById('gallery-lightbox');
        var img = document.getElementById('lightbox-img');
        var caption = document.getElementById('lightbox-caption');
        var closeBtn = document.getElementById('lightbox-close');
        var backdrop = document.getElementById('lightbox-backdrop');
        var prevBtn = document.getElementById('lightbox-prev');
        var nextBtn = document.getElementById('lightbox-next');
        if (!overlay || !img) return;

        var items = [];
        var index = 0;

        function collect() {
            items = Array.prototype.slice.call(document.querySelectorAll('.gallery-item .gallery-img'));
        }

        function show(i) {
            if (!items.length) return;
            index = (i + items.length) % items.length;
            var el = items[index];
            img.src = el.currentSrc || el.src;
            img.alt = el.alt || '';
            var label = '';
            var item = el.closest('.gallery-item');
            if (item) {
                var lbl = item.querySelector('.gallery-label');
                if (lbl) label = lbl.textContent.trim();
            }
            caption.textContent = label;
        }

        function open() {
            if (!items.length) return;
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            closeBtn.focus();
        }

        function close() {
            if (!overlay.classList.contains('open')) return;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            img.removeAttribute('src');
            if (overlay.__returnFocus && typeof overlay.__returnFocus.focus === 'function') {
                overlay.__returnFocus.focus();
                overlay.__returnFocus = null;
            }
        }

        // Event delegation so gallery items rendered asynchronously (from
        // Supabase) work without re-binding on every render.
        function openFromItem(item, e) {
            if (e) e.preventDefault();
            overlay.__returnFocus = document.activeElement;
            collect();
            var itemImg = item.querySelector('.gallery-img');
            index = items.indexOf(itemImg);
            if (index === -1) index = 0;
            show(index);
            open();
        }

        document.addEventListener('click', function(e) {
            var item = e.target && e.target.closest ? e.target.closest('.gallery-item') : null;
            if (item) openFromItem(item, e);
        });

        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var target = e.target;
            if (!target || !target.closest) return;
            var item = target.closest('.gallery-item');
            if (item && item.getAttribute('role') === 'button') {
                e.preventDefault();
                openFromItem(item, e);
            }
        });

        closeBtn.addEventListener('click', close);
        backdrop.addEventListener('click', close);
        nextBtn.addEventListener('click', function() { show(index + 1); });
        prevBtn.addEventListener('click', function() { show(index - 1); });

        document.addEventListener('keydown', function(e) {
            if (!overlay.classList.contains('open')) return;
            if (e.key === 'Escape') {
                close();
            } else if (e.key === 'ArrowLeft') {
                show(index + 1);  // RTL: next visually to the left
            } else if (e.key === 'ArrowRight') {
                show(index - 1);
            }
        });
    }

    // ===== GALLERY (Supabase-backed) =====
    function initGallery() {
        var grid = document.getElementById('gallery-grid');
        if (!grid || !window.GalleryAPI) return;
        var loadingEl = document.getElementById('gallery-loading');

        window.GalleryAPI.list()
            .then(function(items) {
                if (loadingEl) loadingEl.remove();
                if (!items.length) {
                    renderGalleryState(grid, 'لم تُضف صور إلى المعرض بعد.');
                    return;
                }
                renderGalleryItems(grid, items);
            })
            .catch(function(err) {
                if (loadingEl) loadingEl.remove();
                renderGalleryState(grid, 'تعذر تحميل المعرض. يرجى المحاولة لاحقاً.');
                console.error('Gallery load failed:', err);
            });
    }

    function renderGalleryState(grid, message) {
        var el = document.createElement('div');
        el.className = 'gallery-state';
        el.textContent = message;
        grid.appendChild(el);
    }

    function renderGalleryItems(grid, items) {
        var fragment = document.createDocumentFragment();

        items.forEach(function(item, i) {
            var div = document.createElement('div');
            div.className = 'gallery-item scroll-reveal' + (item.is_tall ? ' gallery-item-tall' : '');
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-label', item.label || 'صورة من العيادة');

            var img = document.createElement('img');
            img.className = 'gallery-img';
            img.alt = item.label || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('load', function() {
                img.classList.add('loaded');
            });
            img.src = item.url || '';
            if (img.complete) img.classList.add('loaded');

            var overlay = document.createElement('div');
            overlay.className = 'gallery-overlay';
            overlay.innerHTML =
                '<span class="material-symbols-outlined gallery-zoom">zoom_in</span>' +
                '<span class="gallery-label"></span>';
            div.appendChild(img);
            div.appendChild(overlay);

            var label = overlay.querySelector('.gallery-label');
            if (item.label) label.textContent = item.label;

            if (item.description) div.setAttribute('data-caption', item.description);

            fragment.appendChild(div);
        });

        grid.appendChild(fragment);
        observeGalleryReveals(grid);
    }

    function observeGalleryReveals(grid) {
        var items = grid.querySelectorAll('.gallery-item.scroll-reveal');
        if (!items.length) return;

        if (prefersReducedMotion) {
            items.forEach(function(el) { el.classList.add('revealed'); });
            return;
        }

        items.forEach(function(el, i) {
            var delay = (i % 6) * 100;
            el.style.transitionDelay = delay + 'ms';
        });

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

        items.forEach(function(el) { observer.observe(el); });
    }

    // ===== FOOTER YEAR =====
    function initFooterYear() {
        var yearEl = document.getElementById('footer-year');
        if (!yearEl) return;
        var year = String(new Date().getFullYear());
        yearEl.textContent = year.replace(/\d/g, function(d) { return String.fromCharCode(0x0660 + Number(d)); });
    }

    // ===== SMOOTH SCROLL FOR NAV LINKS =====
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
            anchor.addEventListener('click', function(e) {
                var href = this.getAttribute('href');
                if (href === '#') return;

                // Skip links should jump instantly, not smooth-scroll.
                if (this.classList.contains('skip-link')) return;

                var target = document.querySelector(href);
                if (!target) return;

                // Modal/lightbox targets are fixed overlays, not scroll destinations.
                if (target.closest('.modal-overlay, .lightbox')) return;

                var rect = target.getBoundingClientRect();
                if (!rect.width && !rect.height) return;

                e.preventDefault();
                var offset = 100; // navbar height
                var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: top, behavior: 'smooth' });
            });
        });
    }

    // ===== ACTIVE NAV LINK HIGHLIGHT =====
    function initActiveNav() {
        var navLinks = document.querySelectorAll('.nav-link');

        function updateActive() {
            // Re-query sections every time so any section added after init
            // (e.g. the React-rendered Clinic & Technologies section) is tracked.
            var sections = document.querySelectorAll('section[id]');
            var scrollPos = window.scrollY + 150;

            sections.forEach(function(section) {
                var top = section.offsetTop;
                var height = section.offsetHeight;
                var id = section.getAttribute('id');

                if (scrollPos >= top && scrollPos < top + height) {
                    navLinks.forEach(function(link) {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === '#' + id) {
                            link.classList.add('active');
                        }
                    });
                }
            });

            // When the page bottom is reached, the last section's own top can
            // be unreachable (clamped by max scroll), so activate it explicitly.
            var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            if (atBottom && sections.length) {
                var last = sections[sections.length - 1];
                var lastId = last.getAttribute('id');
                navLinks.forEach(function(link) {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + lastId) {
                        link.classList.add('active');
                    }
                });
            }
        }

        window.addEventListener('scroll', updateActive, { passive: true });
    }

    // ===== SLIDING NAV UNDERLINE =====
    // One shared underline that glides under the hovered title and returns
    // to the active (in-view) title. Always matches the link's exact box,
    // so it never sits misaligned under a title.
    function initNavUnderline() {
        var navLinksEl = document.querySelector('.nav-links');
        if (!navLinksEl) return;

        var links = Array.prototype.slice.call(navLinksEl.querySelectorAll('.nav-link'));
        var underline = document.createElement('span');
        underline.className = 'nav-underline';
        underline.setAttribute('aria-hidden', 'true');
        navLinksEl.appendChild(underline);

        function place(el) {
            underline.style.left = el.offsetLeft + 'px';
            underline.style.width = el.offsetWidth + 'px';
        }

        function placeActive() {
            var active = document.querySelector('.nav-link.active');
            if (active) place(active);
        }

        links.forEach(function(link) {
            link.addEventListener('mouseenter', function() {
                place(link);
            });
        });

        navLinksEl.addEventListener('mouseleave', placeActive);

        window.addEventListener('scroll', placeActive, { passive: true });
        window.addEventListener('resize', placeActive);
        placeActive();
    }

    // ===== INITIALIZE EVERYTHING =====
    function init() {
        initBackground();
        initHeroSmoke();
        initNavbar();
        initMobileMenu();
        initHeroAnimations();
        initScrollReveal();
        initTimeline();
        initPortraitParallax();
        initLightbox();
        initGallery();
        initSmoothScroll();
        initActiveNav();
        initNavUnderline();
        initFooterYear();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
