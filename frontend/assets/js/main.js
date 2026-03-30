/**
 * Main
 */

'use strict';

let menu,
  animate;
document.addEventListener('DOMContentLoaded', function () {
  // class for ios specific styles
  if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
    document.body.classList.add('ios');
  }
});

(function () {
  // Initialize menu
  //-----------------
  
  function initializeMenu() {
    let layoutMenuEl = document.querySelectorAll('#layout-menu');
    layoutMenuEl.forEach(function (element) {
      // Verify menu-inner exists before initializing
      const menuInner = element.querySelector('.menu-inner');
      if (menuInner) {
        menu = new Menu(element, {
          orientation: 'vertical',
          closeChildren: false
        });
        // Change parameter to true if you want scroll animation
        window.Helpers.scrollToActive((animate = false));
        window.Helpers.mainMenu = menu;
        console.log('✅ Menu initialized successfully');
      } else {
        console.warn('⚠️ Menu inner not found, skipping Menu initialization');
      }
    });
  }
  
  // Wait for menu content to be injected before initializing
  window.addEventListener('menuContentInjected', initializeMenu);
  
  // Fallback: Initialize immediately if menu content already exists
  // (This handles cases where injection happens before this script loads)
  document.addEventListener('DOMContentLoaded', function() {
    const menuInner = document.querySelector('#layout-menu .menu-inner');
    if (menuInner && !window.Helpers.mainMenu) {
      console.log('ℹ️ Menu content already present, initializing immediately');
      initializeMenu();
    }
  });

  // Helper to close the menu consistently
  function closeMenu() {
    const layoutMenu = document.getElementById('layout-menu');
    const layoutOverlay = document.querySelector('.layout-overlay');
    if (layoutMenu) {
      layoutMenu.classList.remove('menu-open');
    }
    if (layoutOverlay) {
      layoutOverlay.classList.remove('active');
    }
    document.body.classList.remove('menu-open');
    document.body.style.overflow = '';
  }

  // Helper to open the menu consistently
  function openMenu() {
    const layoutMenu = document.getElementById('layout-menu');
    const layoutOverlay = document.querySelector('.layout-overlay');
    if (layoutMenu && layoutOverlay) {
      layoutMenu.classList.add('menu-open');
      layoutOverlay.classList.add('active');
      document.body.classList.add('menu-open');
      document.body.style.overflow = 'hidden';
    }
  }

  // Use event delegation so it works for dynamically injected menu elements
  document.addEventListener('click', event => {
    const toggleBtn = event.target.closest('.layout-menu-toggle, .mobile-menu-toggle');
    const overlayEl = event.target.closest('.layout-overlay');

    if (toggleBtn) {
      event.preventDefault();

      if (window.Helpers.isSmallScreen()) {
        const layoutMenu = document.getElementById('layout-menu');
        if (layoutMenu && layoutMenu.classList.contains('menu-open')) {
          closeMenu();
        } else {
          openMenu();
        }
      } else {
        // Desktop behavior: toggle sidebar visibility via CSS class
        document.documentElement.classList.toggle('desktop-menu-collapsed');
      }
      return;
    }

    if (overlayEl) {
      event.preventDefault();

      if (window.Helpers.isSmallScreen()) {
        closeMenu();
      } else {
        if (!window.Helpers.isCollapsed()) {
          window.Helpers.setCollapsed(true, true);
        }
      }
      return;
    }

    // Close menu when clicking outside of it
    if (window.Helpers.isSmallScreen()) {
      const layoutMenu = document.getElementById('layout-menu');
      if (layoutMenu && layoutMenu.classList.contains('menu-open')) {
        const isClickInsideMenu = layoutMenu.contains(event.target);
        if (!isClickInsideMenu) {
          closeMenu();
        }
      }
    }
  }, true);

  // Display menu toggle (layout-menu-toggle) on hover with delay
  let delay = function (elem, callback) {
    let timeout = null;
    elem.onmouseenter = function () {
      // Set timeout to be a timer which will invoke callback after 300ms (not for small screen)
      if (!Helpers.isSmallScreen()) {
        timeout = setTimeout(callback, 300);
      } else {
        timeout = setTimeout(callback, 0);
      }
    };

    elem.onmouseleave = function () {
      // Clear any timers set to timeout
      document.querySelector('.layout-menu-toggle').classList.remove('d-block');
      clearTimeout(timeout);
    };
  };
  if (document.getElementById('layout-menu')) {
    delay(document.getElementById('layout-menu'), function () {
      // not for small screen
      if (!Helpers.isSmallScreen()) {
        document.querySelector('.layout-menu-toggle').classList.add('d-block');
      }
    });
  }

  // Display in main menu when menu scrolls
  let menuInnerContainer = document.getElementsByClassName('menu-inner'),
    menuInnerShadow = document.getElementsByClassName('menu-inner-shadow')[0];
  if (menuInnerContainer.length > 0 && menuInnerShadow) {
    menuInnerContainer[0].addEventListener('ps-scroll-y', function () {
      if (this.querySelector('.ps__thumb-y').offsetTop) {
        menuInnerShadow.style.display = 'block';
      } else {
        menuInnerShadow.style.display = 'none';
      }
    });
  }

  // Init helpers & misc
  // --------------------

  // Init BS Tooltip
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Accordion active class
  const accordionActiveFunction = function (e) {
    if (e.type == 'show.bs.collapse' || e.type == 'show.bs.collapse') {
      e.target.closest('.accordion-item').classList.add('active');
    } else {
      e.target.closest('.accordion-item').classList.remove('active');
    }
  };

  const accordionTriggerList = [].slice.call(document.querySelectorAll('.accordion'));
  const accordionList = accordionTriggerList.map(function (accordionTriggerEl) {
    accordionTriggerEl.addEventListener('show.bs.collapse', accordionActiveFunction);
    accordionTriggerEl.addEventListener('hide.bs.collapse', accordionActiveFunction);
  });

  // Auto update layout based on screen size
  window.Helpers.setAutoUpdate(true);

  // Toggle Password Visibility
  window.Helpers.initPasswordToggle();

  // Speech To Text
  window.Helpers.initSpeechToText();

  // Manage menu expanded/collapsed with templateCustomizer & local storage
  //------------------------------------------------------------------

  // On small screens, ensure menu starts collapsed
  if (window.Helpers.isSmallScreen()) {
    window.Helpers.setCollapsed(true, false);
  }
})();
// Utils
function isMacOS() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
}
