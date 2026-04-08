/* ============================================================
   LYME TREATMENT GERMANY — Scroll-Stopping Engine
   Cinematic scroll animations, counters, parallax, interactions
   ============================================================ */

(function () {
  'use strict';

  /* ===========================================
     SCROLL REVEAL — IntersectionObserver
     =========================================== */
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Stagger children if container has data-stagger
        if (entry.target.hasAttribute('data-stagger')) {
          var children = entry.target.querySelectorAll('.reveal-child');
          children.forEach(function (child, i) {
            child.style.transitionDelay = (i * 120) + 'ms';
            child.classList.add('revealed');
          });
        }
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal, [data-stagger]').forEach(function (el) {
    revealObserver.observe(el);
  });

  /* ===========================================
     ANIMATED COUNTERS
     =========================================== */
  var counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(function (el) {
    counterObserver.observe(el);
  });

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var duration = 2000;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(eased * target);
      el.textContent = prefix + current.toLocaleString() + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = prefix + target.toLocaleString() + suffix;
      }
    }
    requestAnimationFrame(step);
  }

  /* ===========================================
     PARALLAX — Subtle depth on scroll
     =========================================== */
  var parallaxEls = document.querySelectorAll('[data-parallax]');
  if (parallaxEls.length) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var scrollY = window.scrollY;
          parallaxEls.forEach(function (el) {
            var speed = parseFloat(el.getAttribute('data-parallax')) || 0.3;
            var rect = el.getBoundingClientRect();
            var offset = (rect.top + scrollY - window.innerHeight / 2) * speed;
            el.style.transform = 'translate3d(0,' + (-offset * 0.1) + 'px,0)';
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ===========================================
     HEADER — Glassmorphism on scroll
     =========================================== */
  var header = document.querySelector('.site-header');
  if (header) {
    var lastScroll = 0;
    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY;
      header.classList.toggle('scrolled', scrollY > 20);
      // Auto-hide on scroll down, show on scroll up
      if (scrollY > 400) {
        header.classList.toggle('header-hidden', scrollY > lastScroll && scrollY - lastScroll > 5);
      } else {
        header.classList.remove('header-hidden');
      }
      lastScroll = scrollY;
    }, { passive: true });
  }

  /* ===========================================
     SCROLL PROGRESS BAR
     =========================================== */
  var progressBar = document.querySelector('.scroll-progress');
  if (progressBar) {
    window.addEventListener('scroll', function () {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var progress = (scrollTop / docHeight) * 100;
      progressBar.style.width = progress + '%';
    }, { passive: true });
  }

  /* ===========================================
     MOBILE MENU
     =========================================== */
  var toggle = document.querySelector('.nav__toggle');
  var navList = document.querySelector('.nav__list');
  if (toggle && navList) {
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      navList.classList.toggle('nav__list--open');
      toggle.classList.toggle('nav__toggle--active');
      document.body.classList.toggle('menu-open');
    });
  }

  /* ===========================================
     FAQ ACCORDION
     =========================================== */
  document.querySelectorAll('.faq__question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq__item');
      var answer = item.querySelector('.faq__answer');
      var wasActive = item.classList.contains('active');

      item.closest('.faq').querySelectorAll('.faq__item').forEach(function (other) {
        other.classList.remove('active');
        other.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
        var a = other.querySelector('.faq__answer');
        a.style.maxHeight = null;
        a.setAttribute('aria-hidden', 'true');
      });

      if (!wasActive) {
        item.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        answer.setAttribute('aria-hidden', 'false');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  /* ===========================================
     SMOOTH SCROLL
     =========================================== */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ===========================================
     DROPDOWN KEYBOARD
     =========================================== */
  document.querySelectorAll('.nav__dropdown').forEach(function (dropdown) {
    var trigger = dropdown.querySelector('.nav__link');
    var menu = dropdown.querySelector('.nav__dropdown-menu');
    if (trigger && menu) {
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
      });
    }
  });

  /* ===========================================
     MAGNETIC BUTTONS — Subtle cursor follow
     =========================================== */
  document.querySelectorAll('.btn--magnetic').forEach(function (btn) {
    btn.addEventListener('mousemove', function (e) {
      var rect = btn.getBoundingClientRect();
      var x = e.clientX - rect.left - rect.width / 2;
      var y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = 'translate(' + (x * 0.15) + 'px, ' + (y * 0.15) + 'px)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = 'translate(0, 0)';
    });
  });

  /* ===========================================
     TESTIMONIAL CAROUSEL
     =========================================== */
  var carousel = document.querySelector('.testimonial-carousel');
  if (carousel) {
    var slides = carousel.querySelectorAll('.testimonial-slide');
    var dots = carousel.querySelectorAll('.carousel-dot');
    var current = 0;
    var interval;

    function showSlide(n) {
      slides.forEach(function (s, i) {
        s.classList.toggle('active', i === n);
        s.style.opacity = i === n ? '1' : '0';
        s.style.transform = i === n ? 'translateX(0)' : (i < n ? 'translateX(-30px)' : 'translateX(30px)');
      });
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === n);
      });
    }

    function nextSlide() {
      current = (current + 1) % slides.length;
      showSlide(current);
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        current = i;
        showSlide(current);
        clearInterval(interval);
        interval = setInterval(nextSlide, 6000);
      });
    });

    showSlide(0);
    interval = setInterval(nextSlide, 6000);
  }

  /* ===========================================
     TILT CARDS — 3D perspective on hover
     =========================================== */
  document.querySelectorAll('.card--tilt').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var rect = card.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = 'perspective(800px) rotateY(' + (x * 6) + 'deg) rotateX(' + (-y * 6) + 'deg) scale(1.02)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform = 'perspective(800px) rotateY(0) rotateX(0) scale(1)';
    });
  });

})();
