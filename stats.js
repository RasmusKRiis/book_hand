import * as THREE from 'three';

const BOOKS_URL = 'data/books.json';
const BIRTHPLACES_URL = 'data/author_birthplaces.json';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ERA_COLORS = {
  before: 0x5f91b3,
  twoThousands: 0xd96b78,
  twentyTens: 0x789b73,
  twentyTwenties: 0xe4bd45
};

const PRECISION_COLORS = {
  city: 0xc7485d,
  region: 0xe4bd45,
  country: 0x5f91b3,
  collective: 0x789b73,
  organization: 0x789b73
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scale(value, inputMin, inputMax, outputMin, outputMax) {
  if (inputMax === inputMin) {
    return (outputMin + outputMax) / 2;
  }
  const ratio = (value - inputMin) / (inputMax - inputMin);
  return outputMin + ratio * (outputMax - outputMin);
}

function hashText(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function parseFinishedDate(value = '') {
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) {
    return {
      date: new Date(Date.UTC(Number(text), 6, 1)),
      label: text,
      approximate: true
    };
  }

  const normalized = text.replace('.', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return { date, label: normalized, approximate: normalized !== text };
    }
  }

  return null;
}

function eraColor(year) {
  if (year < 2000) {
    return ERA_COLORS.before;
  }
  if (year < 2010) {
    return ERA_COLORS.twoThousands;
  }
  if (year < 2020) {
    return ERA_COLORS.twentyTens;
  }
  return ERA_COLORS.twentyTwenties;
}

function createTextSprite(text, color = '#4e4942', fontSize = 48) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = `${fontSize}px "Jersey 15", sans-serif`;
  const width = Math.ceil(context.measureText(text).width + 24);
  canvas.width = width;
  canvas.height = fontSize + 20;
  context.font = `${fontSize}px "Jersey 15", sans-serif`;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const ratio = width / canvas.height;
  sprite.scale.set(ratio * .46, .46, 1);
  return sprite;
}

function positionTooltip(tooltip, event, section) {
  const rect = section.getBoundingClientRect();
  const width = tooltip.offsetWidth || 272;
  const height = tooltip.offsetHeight || 110;
  const left = clamp(event.clientX - rect.left + 14, 12, rect.width - width - 12);
  const top = clamp(event.clientY - rect.top + 14, 12, rect.height - height - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function setTooltip(tooltip, event, section, html) {
  tooltip.innerHTML = html;
  tooltip.classList.add('is-visible');
  positionTooltip(tooltip, event, section);
}

function hideTooltip(tooltip) {
  tooltip.classList.remove('is-visible');
}

function createLine(points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geometry, material);
}

class TimelineChart {
  constructor(canvas, section, tooltip, books) {
    this.canvas = canvas;
    this.section = section;
    this.tooltip = tooltip;
    this.books = books;
    this.pointer = new THREE.Vector2(10, 10);
    this.raycaster = new THREE.Raycaster();
    this.meshes = [];
    this.hovered = null;
    this.clock = new THREE.Clock();
    this.cameraDrift = new THREE.Vector2();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    this.camera.position.set(0, .4, 15);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x897e6b, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(4, 7, 8);
    this.scene.add(keyLight);

    this.build();
    this.bind();
    this.resize();
    this.animate();
  }

  build() {
    const usableBooks = this.books
      .filter((book) => book.status === 'read')
      .map((book) => ({
        ...book,
        publishedYear: Number.parseInt(book.release_date, 10),
        finished: parseFinishedDate(book.date_read)
      }))
      .filter((book) => Number.isFinite(book.publishedYear) && book.finished);

    this.usableBooks = usableBooks;
    const years = usableBooks.map((book) => book.publishedYear);
    const times = usableBooks.map((book) => book.finished.date.getTime());
    this.minYear = Math.min(...years);
    this.maxYear = Math.max(...years);
    this.minTime = Math.min(...times);
    this.maxTime = Math.max(...times);

    document.getElementById('finishedCount').textContent = String(usableBooks.length);
    document.getElementById('yearSpan').textContent = `${this.minYear}-${this.maxYear}`;

    const plot = new THREE.Group();
    plot.position.set(.25, -1, 0);
    this.scene.add(plot);
    this.plot = plot;

    const axisColor = 0x5e574e;
    plot.add(createLine([
      new THREE.Vector3(-3.95, -3, 0),
      new THREE.Vector3(4.55, -3, 0)
    ], axisColor, .75));
    plot.add(createLine([
      new THREE.Vector3(-3.95, -3, 0),
      new THREE.Vector3(-3.95, 2.5, 0)
    ], axisColor, .75));

    const yearTicks = [...new Set([
      this.minYear,
      1950,
      1970,
      1990,
      2010,
      this.maxYear
    ].filter((year) => year >= this.minYear && year <= this.maxYear))];

    yearTicks.forEach((year) => {
      const x = scale(year, this.minYear, this.maxYear, -3.7, 4.3);
      plot.add(createLine([
        new THREE.Vector3(x, -2.9, -.35),
        new THREE.Vector3(x, 2.4, -.35)
      ], 0x776f64, .16));
      const label = createTextSprite(String(year));
      label.position.set(x, -3.42, 0);
      plot.add(label);
    });

    const startYear = new Date(this.minTime).getUTCFullYear();
    const endYear = new Date(this.maxTime).getUTCFullYear();
    for (let year = startYear; year <= endYear; year += 1) {
      const time = Date.UTC(year, 0, 1);
      const y = scale(time, this.minTime, this.maxTime, -2.75, 2.25);
      plot.add(createLine([
        new THREE.Vector3(-3.85, y, -.35),
        new THREE.Vector3(4.45, y, -.35)
      ], 0x776f64, .2));
      const label = createTextSprite(String(year));
      label.position.set(-2.85, year === startYear ? y + .28 : y, 0);
      plot.add(label);
    }

    const geometry = new THREE.BoxGeometry(.23, .34, .1);
    usableBooks.forEach((book, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: eraColor(book.publishedYear),
        roughness: .62,
        metalness: .05
      });
      const mesh = new THREE.Mesh(geometry, material);
      const x = scale(book.publishedYear, this.minYear, this.maxYear, -3.7, 4.3);
      const y = scale(book.finished.date.getTime(), this.minTime, this.maxTime, -2.75, 2.25);
      const z = scale(hashText(`${book.author}-${book.title}`) % 1000, 0, 999, -.8, .8);
      mesh.position.set(x, y, z);
      mesh.rotation.set(0, (hashText(book.title) % 20 - 10) * .012, .08);
      mesh.scale.setScalar(reducedMotion ? 1 : .01);
      mesh.userData = { book, baseY: y, index };
      plot.add(mesh);
      this.meshes.push(mesh);

      const trail = createLine([
        new THREE.Vector3(x, -2.97, z),
        new THREE.Vector3(x, y - .18, z)
      ], eraColor(book.publishedYear), .18);
      plot.add(trail);
    });
  }

  bind() {
    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.cameraDrift.set(this.pointer.x, this.pointer.y);
      this.pick(event);
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.set(10, 10);
      this.setHovered(null);
      hideTooltip(this.tooltip);
    });
    window.addEventListener('resize', () => this.resize());
  }

  pick(event) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const mesh = hit?.object || null;
    this.setHovered(mesh);
    if (!mesh) {
      hideTooltip(this.tooltip);
      return;
    }

    const { book } = mesh.userData;
    const approximate = book.finished.approximate ? ' (year only)' : '';
    setTooltip(
      this.tooltip,
      event,
      this.section,
      `<strong>${book.title}</strong><span>${book.author}</span><span>Published ${book.release_date} / Finished ${book.finished.label}${approximate}</span>`
    );
  }

  setHovered(mesh) {
    if (this.hovered === mesh) {
      return;
    }
    if (this.hovered) {
      this.hovered.scale.setScalar(1);
      this.hovered.material.emissive.setHex(0x000000);
    }
    this.hovered = mesh;
    this.canvas.style.cursor = mesh ? 'pointer' : 'default';
    if (mesh) {
      mesh.scale.setScalar(1.9);
      mesh.material.emissive.setHex(0x55411f);
    }
  }

  resize() {
    const width = this.section.clientWidth;
    const height = this.section.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = width < 700 ? 34 : 15;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const elapsed = this.clock.getElapsedTime();
    if (!reducedMotion) {
      this.meshes.forEach((mesh) => {
        const delay = mesh.userData.index * .018;
        const growth = clamp((elapsed - delay) * 3, 0, 1);
        if (mesh !== this.hovered) {
          mesh.scale.setScalar(growth);
        }
        mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * .8 + mesh.userData.index) * .018;
      });
      this.camera.position.x += (this.cameraDrift.x * .35 - this.camera.position.x) * .025;
      this.camera.position.y += ((.4 + this.cameraDrift.y * .18) - this.camera.position.y) * .025;
    }
    this.camera.lookAt(0, -.35, 0);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }
}

function latLonToVector3(latitude, longitude, radius) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function clusterOrigins(books, birthplaces) {
  const authorBooks = new Map();
  books.forEach((book) => {
    if (!authorBooks.has(book.author)) {
      authorBooks.set(book.author, []);
    }
    authorBooks.get(book.author).push(book);
  });

  const clusters = new Map();
  authorBooks.forEach((authorTitles, author) => {
    const birthplace = birthplaces[author];
    if (!birthplace) {
      return;
    }
    const key = `${birthplace.latitude.toFixed(3)}:${birthplace.longitude.toFixed(3)}:${birthplace.place}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        ...birthplace,
        authors: [],
        books: []
      });
    }
    const cluster = clusters.get(key);
    cluster.authors.push(author);
    cluster.books.push(...authorTitles);
  });

  return [...clusters.values()].sort((a, b) => b.books.length - a.books.length);
}

class OriginsChart {
  constructor(canvas, section, tooltip, detail, books, birthplaces) {
    this.canvas = canvas;
    this.section = section;
    this.tooltip = tooltip;
    this.detail = detail;
    this.clusters = clusterOrigins(books, birthplaces);
    this.pointer = new THREE.Vector2(10, 10);
    this.raycaster = new THREE.Raycaster();
    this.markers = [];
    this.hovered = null;
    this.dragging = false;
    this.dragDistance = 0;
    this.lastPointer = new THREE.Vector2();
    this.clock = new THREE.Clock();

    document.getElementById('authorCount').textContent = String(Object.keys(birthplaces).length);
    document.getElementById('placeCount').textContent = String(this.clusters.length);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
    this.camera.position.set(0, 0, 7.2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.globe = new THREE.Group();
    this.globe.rotation.set(.12, 1.48, 0);
    this.scene.add(this.globe);

    this.scene.add(new THREE.HemisphereLight(0xe8f0df, 0x2d352b, 2.8));
    const keyLight = new THREE.DirectionalLight(0xfff6dc, 3.6);
    keyLight.position.set(-4, 5, 6);
    this.scene.add(keyLight);

    this.build();
    this.bind();
    this.resize();
    this.selectCluster(this.clusters[0]);
    this.animate();
  }

  build() {
    const texture = new THREE.TextureLoader().load('assets/earth_atmos_2048.jpg');
    texture.colorSpace = THREE.SRGBColorSpace;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.25, 64, 64),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: .88,
        metalness: 0
      })
    );
    this.globe.add(sphere);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.31, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0xdde9d8,
        transparent: true,
        opacity: .12,
        side: THREE.BackSide
      })
    );
    this.globe.add(atmosphere);

    const markerGeometry = new THREE.SphereGeometry(.075, 16, 16);
    this.clusters.forEach((cluster, index) => {
      const color = PRECISION_COLORS[cluster.precision] || PRECISION_COLORS.country;
      const position = latLonToVector3(cluster.latitude, cluster.longitude, 2.38);
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: .28,
          roughness: .35
        })
      );
      const size = 1 + Math.min(cluster.books.length, 5) * .12;
      marker.scale.setScalar(size);
      marker.position.copy(position);
      marker.userData = { cluster, baseScale: size, index };
      this.globe.add(marker);
      this.markers.push(marker);

      const stemStart = latLonToVector3(cluster.latitude, cluster.longitude, 2.23);
      const stemEnd = latLonToVector3(cluster.latitude, cluster.longitude, 2.35);
      this.globe.add(createLine([stemStart, stemEnd], color, .82));

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.09, .115, 20),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: .66,
          side: THREE.DoubleSide
        })
      );
      ring.position.copy(latLonToVector3(cluster.latitude, cluster.longitude, 2.27));
      ring.lookAt(ring.position.clone().multiplyScalar(2));
      ring.userData = { index };
      this.globe.add(ring);
    });
  }

  bind() {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.dragDistance = 0;
      this.lastPointer.set(event.clientX, event.clientY);
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.dragging) {
        const deltaX = event.clientX - this.lastPointer.x;
        const deltaY = event.clientY - this.lastPointer.y;
        this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
        this.globe.rotation.y += deltaX * .006;
        this.globe.rotation.x = clamp(this.globe.rotation.x + deltaY * .004, -.8, .8);
        this.lastPointer.set(event.clientX, event.clientY);
        hideTooltip(this.tooltip);
        return;
      }

      this.pick(event);
    });

    this.canvas.addEventListener('pointerup', (event) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      if (this.dragDistance < 8) {
        const marker = this.pick(event);
        if (marker) {
          this.selectCluster(marker.userData.cluster);
        }
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.dragging = false;
      this.pointer.set(10, 10);
      this.setHovered(null);
      hideTooltip(this.tooltip);
    });

    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.camera.position.z = clamp(this.camera.position.z + event.deltaY * .004, 5.2, 9);
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
  }

  pick(event) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.markers, false)[0];
    const marker = hit?.object || null;
    this.setHovered(marker);
    if (!marker) {
      hideTooltip(this.tooltip);
      return null;
    }

    const cluster = marker.userData.cluster;
    const authorLabel = cluster.authors.join(', ');
    setTooltip(
      this.tooltip,
      event,
      this.section,
      `<strong>${cluster.place}</strong><span>${authorLabel}</span><span>${cluster.books.length} ${cluster.books.length === 1 ? 'book' : 'books'} on the shelf</span>`
    );
    return marker;
  }

  setHovered(marker) {
    if (this.hovered === marker) {
      return;
    }
    if (this.hovered) {
      this.hovered.scale.setScalar(this.hovered.userData.baseScale);
      this.hovered.material.emissiveIntensity = .28;
    }
    this.hovered = marker;
    this.canvas.style.cursor = marker ? 'pointer' : (this.dragging ? 'grabbing' : 'grab');
    if (marker) {
      marker.scale.setScalar(marker.userData.baseScale * 1.7);
      marker.material.emissiveIntensity = .9;
    }
  }

  selectCluster(cluster) {
    if (!cluster) {
      return;
    }
    document.getElementById('originPlace').textContent = cluster.place;
    document.getElementById('originAuthors').textContent = cluster.authors.join(' / ');
    const booksContainer = document.getElementById('originBooks');
    booksContainer.innerHTML = '';
    cluster.books.slice(0, 7).forEach((book) => {
      const image = document.createElement('img');
      image.className = 'origin-book-cover';
      image.src = `assets/${book.cover_image}`;
      image.alt = book.title;
      image.title = book.title;
      image.loading = 'lazy';
      image.onerror = () => {
        image.onerror = null;
        image.src = 'book.png';
      };
      booksContainer.appendChild(image);
    });
    if (cluster.books.length > 7) {
      const more = document.createElement('span');
      more.className = 'origin-book-more';
      more.textContent = `+${cluster.books.length - 7}`;
      booksContainer.appendChild(more);
    }
  }

  resize() {
    const width = this.section.clientWidth;
    const height = this.section.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = width < 700 ? 11.6 : 7.2;
    this.globe.position.x = width < 780 ? 0 : 1.05;
    this.globe.position.y = width < 780 ? -1.05 : 0;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const elapsed = this.clock.getElapsedTime();
    if (!this.dragging && !reducedMotion) {
      this.globe.rotation.y += .0009;
    }
    this.markers.forEach((marker) => {
      if (marker !== this.hovered && !reducedMotion) {
        const pulse = 1 + Math.sin(elapsed * 1.8 + marker.userData.index) * .06;
        marker.scale.setScalar(marker.userData.baseScale * pulse);
      }
    });
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('.chart-tab')];
  const sections = tabs
    .map((tab) => document.querySelector(tab.getAttribute('href')))
    .filter(Boolean);

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) {
      return;
    }
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('href') === `#${visible.target.id}`);
    });
  }, { threshold: [.35, .6] });

  sections.forEach((section) => observer.observe(section));
}

async function loadStats() {
  const [booksResponse, birthplacesResponse] = await Promise.all([
    fetch(BOOKS_URL, { cache: 'no-cache' }),
    fetch(BIRTHPLACES_URL, { cache: 'no-cache' })
  ]);

  if (!booksResponse.ok || !birthplacesResponse.ok) {
    throw new Error('Statistics data could not be loaded');
  }

  const [{ books }, birthplaces] = await Promise.all([
    booksResponse.json(),
    birthplacesResponse.json()
  ]);

  new TimelineChart(
    document.getElementById('timelineCanvas'),
    document.getElementById('timeline'),
    document.getElementById('timelineTooltip'),
    books
  );

  new OriginsChart(
    document.getElementById('originsCanvas'),
    document.getElementById('origins'),
    document.getElementById('originTooltip'),
    document.getElementById('originDetail'),
    books,
    birthplaces
  );
}

setupTabs();
loadStats().catch((error) => {
  console.error(error);
  document.getElementById('statsError').hidden = false;
});
