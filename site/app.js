(() => {
  'use strict'

  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  /* Header scroll state + mobile navigation -------------------------------- */

  const header = $('#site-header')
  const navToggle = $('.nav-toggle')
  const nav = $('#site-nav')

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 8)
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  const closeNav = () => {
    header.classList.remove('nav-open')
    navToggle.setAttribute('aria-expanded', 'false')
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open')
      navToggle.setAttribute('aria-expanded', String(open))
    })

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeNav()
    })

    document.addEventListener('click', (event) => {
      if (header.classList.contains('nav-open') && !header.contains(event.target)) closeNav()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) {
        closeNav()
        navToggle.focus()
      }
    })
  }

  /* Active section link ----------------------------------------------------- */

  const navLinks = $$('.site-nav a[href^="#"]')
  const linkedSections = navLinks
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter(Boolean)

  let activeFrame = 0
  const updateActiveLink = () => {
    activeFrame = 0
    const threshold = 150
    let active = ''
    for (const section of linkedSections) {
      const rect = section.getBoundingClientRect()
      if (rect.top <= threshold && rect.bottom > threshold) active = section.id
    }
    for (const link of navLinks) {
      const isActive = active !== '' && link.hash === `#${active}`
      link.classList.toggle('active', isActive)
      if (isActive) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }

  const requestActive = () => {
    if (!activeFrame) activeFrame = window.requestAnimationFrame(updateActiveLink)
  }
  window.addEventListener('scroll', requestActive, { passive: true })
  updateActiveLink()

  /* Scroll reveal ----------------------------------------------------------- */

  const revealItems = $$('[data-reveal]')

  for (const item of revealItems) {
    const siblings = Array.from(item.parentElement?.children ?? []).filter((node) =>
      node.hasAttribute('data-reveal')
    )
    if (siblings.length > 1) {
      const index = siblings.indexOf(item)
      item.style.setProperty('--delay', `${Math.min(index * 55, 280)}ms`)
    }
  }

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    for (const item of revealItems) item.classList.add('is-visible')
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -7% 0px', threshold: 0.08 }
    )
    for (const item of revealItems) revealObserver.observe(item)
  }

  /* Hero parallax ----------------------------------------------------------- */

  const heroArt = $('#hero-art')
  const appWindow = heroArt ? $('.app-window', heroArt) : null
  const finePointer = window.matchMedia('(pointer: fine)')

  if (heroArt && appWindow && finePointer.matches) {
    let frame = 0
    let lastX = 0
    let lastY = 0

    const applyTilt = () => {
      frame = 0
      appWindow.style.setProperty('--ry', `${(lastX * 2.4).toFixed(2)}deg`)
      appWindow.style.setProperty('--rx', `${(-lastY * 1.8).toFixed(2)}deg`)
    }

    heroArt.addEventListener('pointermove', (event) => {
      if (reduceMotion.matches) return
      const rect = heroArt.getBoundingClientRect()
      lastX = (event.clientX - rect.left) / rect.width - 0.5
      lastY = (event.clientY - rect.top) / rect.height - 0.5
      if (!frame) frame = window.requestAnimationFrame(applyTilt)
    })

    heroArt.addEventListener('pointerleave', () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      appWindow.style.setProperty('--ry', '0deg')
      appWindow.style.setProperty('--rx', '0deg')
    })
  }

  /* Performance lab --------------------------------------------------------- */

  const TIERS = {
    entry: { label: 'Low tier', boost: -2, heap: '3 GB' },
    mainstream: { label: 'Mid tier', boost: 0, heap: '4 GB' },
    high: { label: 'High tier', boost: 2, heap: '6 GB' },
    enthusiast: { label: 'Enthusiast', boost: 4, heap: '8 GB' }
  }

  const PROFILES = {
    competitive: {
      name: 'Competitive',
      chip: 'Competitive',
      title: 'The latency-first plan',
      copy: 'Distance, shadows and particles are cut before input latency is. Built for PvP, older laptops and high-refresh monitors.',
      fps: 260,
      graphics: 'Fast',
      particles: 'Minimal',
      shadows: false,
      preset: 'Low-latency G1',
      codeGraphics: '0',
      codeParticles: '2',
      blend: '0'
    },
    balanced: {
      name: 'Balanced',
      chip: 'Balanced',
      title: 'The everyday plan',
      copy: 'Useful draw distance, a 144 frame cap, and shadows kept for depth perception. The plan that fits most machines.',
      fps: 144,
      graphics: 'Fancy',
      particles: 'Decreased',
      shadows: true,
      preset: 'Aikar G1',
      codeGraphics: '1',
      codeParticles: '1',
      blend: '2'
    },
    quality: {
      name: 'Quality',
      chip: 'Quality',
      title: 'The headroom plan',
      copy: 'More chunks, full particles and shadows on. For screenshots, shaders, and hardware with room to spare.',
      fps: 120,
      graphics: 'Fancy',
      particles: 'All',
      shadows: true,
      preset: 'Aikar G1',
      codeGraphics: '1',
      codeParticles: '0',
      blend: '3'
    }
  }

  const lab = $('#perf-lab')
  const labState = { tier: 'high', profile: 'balanced' }

  const computePlan = () => {
    const tier = TIERS[labState.tier]
    const profile = PROFILES[labState.profile]
    const render =
      labState.profile === 'competitive'
        ? Math.max(4, 8 + tier.boost)
        : labState.profile === 'balanced'
          ? Math.max(6, 12 + tier.boost)
          : Math.max(8, 16 + tier.boost)
    const simulation =
      labState.profile === 'competitive'
        ? Math.max(4, 5 + Math.floor(tier.boost / 2))
        : labState.profile === 'balanced'
          ? 8
          : 10
    return { tier, profile, render, simulation }
  }

  const renderLab = () => {
    if (!lab) return
    const { tier, profile, render, simulation } = computePlan()
    const shadows = profile.shadows ? 'true' : 'false'

    const setText = (selector, value) => {
      const node = $(selector)
      if (node) node.textContent = value
    }

    setText('#lab-heap', tier.heap)
    setText('#lab-fps', String(profile.fps))
    setText('#lab-graphics', profile.graphics)
    setText('#lab-particles', profile.particles)
    setText('#lab-render', String(render))
    setText('#lab-sim', String(simulation))
    setText('#lab-plan-id', `${labState.tier} · ${labState.profile}`)
    setText('#lab-profile-chip', profile.chip)
    setText('#lab-profile-name', profile.title)
    setText('#lab-profile-copy', profile.copy)

    const renderBar = $('#lab-render-bar')
    const simBar = $('#lab-sim-bar')
    if (renderBar) renderBar.style.setProperty('--v', `${Math.round((render / 24) * 100)}%`)
    if (simBar) simBar.style.setProperty('--v', `${Math.round((simulation / 16) * 100)}%`)

    const points = $('#lab-profile-points')
    if (points) {
      const rows = [
        `${render} chunk render distance · ${simulation} chunk simulation`,
        `${profile.fps} FPS cap with V-Sync off`,
        `${profile.particles} particles · entity shadows ${profile.shadows ? 'on' : 'off'}`,
        `${tier.heap} heap · ${profile.preset}`
      ]
      points.innerHTML = rows
        .map(
          (row) =>
            `<li><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg><span>${row}</span></li>`
        )
        .join('')
    }

    const values = [
      ['renderDistance', render],
      ['simulationDistance', simulation],
      ['maxFps', profile.fps],
      ['enableVsync', 'false'],
      ['graphicsMode', profile.codeGraphics],
      ['particles', profile.codeParticles],
      ['entityShadows', shadows],
      ['biomeBlendRadius', profile.blend]
    ]
    const code = $('#lab-code')
    if (code) {
      code.innerHTML = values
        .map(
          ([key, value]) =>
            `<span class="k">${key}</span><span class="c">:</span><span class="v">${value}</span>`
        )
        .join('\n')
    }

    for (const button of $$('[data-tier]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tier === labState.tier))
    }
    for (const button of $$('[data-profile]')) {
      button.setAttribute('aria-pressed', String(button.dataset.profile === labState.profile))
    }

    const status = $('#lab-status')
    if (status) {
      status.textContent = `${tier.label}, ${profile.name}: ${render} chunk render distance, ${simulation} simulation distance, ${profile.fps} FPS cap, ${tier.heap} heap.`
    }
  }

  if (lab) {
    for (const button of $$('[data-tier]')) {
      button.addEventListener('click', () => {
        if (!TIERS[button.dataset.tier]) return
        labState.tier = button.dataset.tier
        renderLab()
      })
    }
    for (const button of $$('[data-profile]')) {
      button.addEventListener('click', () => {
        if (!PROFILES[button.dataset.profile]) return
        labState.profile = button.dataset.profile
        renderLab()
      })
    }
    renderLab()
  }

  /* Copy build commands ----------------------------------------------------- */

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }

  const commandsFor = (target) => {
    const text = target.innerText
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/^(?:PS>|\$|>)\s*/i, ''))
      .join('\n')
  }

  for (const button of $$('[data-copy-target]')) {
    button.addEventListener('click', async () => {
      const target = $(button.dataset.copyTarget)
      if (!target) return
      const label = $('.copy-label', button)
      const original = label ? label.textContent : ''

      try {
        await copyText(commandsFor(target))
        button.classList.add('copied')
        if (label) label.textContent = 'Copied to clipboard'
        else button.setAttribute('title', 'Copied')
      } catch {
        if (label) label.textContent = 'Copy failed'
      }

      window.setTimeout(() => {
        button.classList.remove('copied')
        if (label) label.textContent = original
        else button.removeAttribute('title')
      }, 1900)
    })
  }

  /* Download manifest ------------------------------------------------------- */

  const downloadLink = $('[data-download-link]')
  const downloadSize = $('[data-download-size]')
  const downloadSha = $('[data-download-sha]')
  const downloadNote = $('[data-download-note]')

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ''
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }

  if (downloadLink) {
    const fallbackToBuild = () => {
      downloadLink.setAttribute('href', '#build-commands')
      downloadLink.removeAttribute('download')
      const label = $('.download-label', downloadLink)
      if (label) label.textContent = 'Build from source'
      if (downloadNote) {
        downloadNote.textContent =
          'This copy of the site has no installer bundled. Use the build commands below.'
      }
    }

    fetch('downloads/latest.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('download manifest missing')
        return response.json()
      })
      .then((manifest) => {
        if (manifest.file) downloadLink.setAttribute('href', `downloads/${manifest.file}`)
        const size = formatBytes(manifest.size)
        if (size && downloadSize) downloadSize.textContent = size
        if (manifest.sha256 && downloadSha) {
          downloadSha.textContent = manifest.sha256
          downloadSha.title = manifest.sha256
        }
      })
      .catch(fallbackToBuild)
  }

  /* Gallery lightbox -------------------------------------------------------- */

  const shots = $$('.shot')
  const lightbox = $('#lightbox')
  const lightboxImage = $('#lightbox-image')
  const lightboxTitle = $('#lightbox-title')
  const lightboxCaption = $('#lightbox-caption')
  const lightboxCount = $('#lightbox-count')

  if (shots.length && lightbox && lightboxImage && typeof lightbox.showModal === 'function') {
    let shotIndex = 0

    const showShot = (index) => {
      shotIndex = (index + shots.length) % shots.length
      const shot = shots[shotIndex]
      const thumb = $('img', shot)
      lightboxImage.src = shot.dataset.full || thumb.src
      lightboxImage.alt = thumb.alt
      lightboxTitle.textContent = shot.dataset.title || 'Screenshot'
      lightboxCaption.textContent = shot.dataset.caption || ''
      lightboxCount.textContent = `${shotIndex + 1} / ${shots.length}`
    }

    const openShot = (index) => {
      showShot(index)
      lightbox.showModal()
      document.body.classList.add('no-scroll')
    }

    shots.forEach((shot, index) => {
      shot.addEventListener('click', () => openShot(index))
    })

    $('#lightbox-close')?.addEventListener('click', () => lightbox.close())
    $('#lightbox-prev')?.addEventListener('click', () => showShot(shotIndex - 1))
    $('#lightbox-next')?.addEventListener('click', () => showShot(shotIndex + 1))

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) lightbox.close()
    })

    lightbox.addEventListener('close', () => {
      document.body.classList.remove('no-scroll')
    })

    document.addEventListener('keydown', (event) => {
      if (!lightbox.open) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showShot(shotIndex - 1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showShot(shotIndex + 1)
      }
    })
  } else {
    shots.forEach((shot) => {
      shot.addEventListener('click', () => {
        const full = shot.dataset.full
        if (full) window.open(full, '_blank', 'noopener')
      })
    })
  }

  /* Footer year ------------------------------------------------------------- */

  const year = $('#year')
  if (year) year.textContent = String(new Date().getFullYear())
})()
