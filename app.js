
// A short helper to find an element using its ID.
function get(id) {
  return document.getElementById(id);
}

// Save and read information in the browser.
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function rupees(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

// These are the six canteens in the HTML dropdowns.
const canteens = {
  'uni-centre': 'Uni-Centre',
  'arch-block-6': 'Architecture Block 6',
  'blocks-25-26': 'Blocks 25–26',
  'joy-court': 'Joy-Court',
  'buzzz': 'Buzzz Food Court',
  'residential': 'Residential Cafeteria'
};

// Read the original menu from the real HTML cards (not JavaScript strings).
const originalMenu = Array.from(document.querySelectorAll('#foodGrid .food-card')).map(function (card) {
  return {
    id: card.dataset.id,
    canteen: card.dataset.canteen,
    name: card.querySelector('.food-name').textContent,
    description: card.querySelector('.food-description').textContent,
    category: card.dataset.category,
    emoji: card.dataset.emoji,
    price: Number(card.dataset.price),
    available: true
  };
});

// State: all ordinary arrays and objects, so it is easy to understand.
const menu = originalMenu;
let cart = read('prebyte_simple_cart', {});
let orders = read('prebyte_simple_orders', []);
let feedback = read('prebyte_simple_feedback', []);
let selectedCategory = 'All';
let selectedCanteen = 'uni-centre';
let toastTimer;

function message(text) {
  get('toast').textContent = text;
  get('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { get('toast').hidden = true; }, 3000);
}

// A template is HTML stored in the <template> tag in index.html.
// The clone makes a new card without writing long HTML strings in JavaScript.
function copyTemplate(id) {
  return get(id).content.firstElementChild.cloneNode(true);
}

// ================ MENU SEARCH & FILTERS ================
function showMenu() {
  const search = get('searchInput').value.trim().toLowerCase();
  const matches = menu.filter(function (item) {
    return item.available &&
      item.canteen === selectedCanteen &&
      (selectedCategory === 'All' || item.category === selectedCategory) &&
      (item.name + ' ' + item.description).toLowerCase().includes(search);
  });

  get('foodGrid').replaceChildren();
  matches.forEach(function (item) {
    const card = copyTemplate('foodTemplate');
    card.querySelector('.food-art').textContent = item.emoji;
    card.querySelector('.food-type').textContent = item.category;
    card.querySelector('.food-name').textContent = item.name;
    card.querySelector('.food-description').textContent = item.description;
    card.querySelector('.food-price').textContent = rupees(item.price);
    card.querySelector('.add-button').dataset.add = item.id;
    get('foodGrid').appendChild(card);
  });

  get('foodCount').textContent = matches.length + ' items';
  get('noFood').hidden = matches.length > 0;
}

get('canteenFilter').addEventListener('change', function () {
  selectedCanteen = this.value;
  showMenu();
});
get('searchInput').addEventListener('input', showMenu);

document.querySelectorAll('.category-button').forEach(function (button) {
  button.addEventListener('click', function () {
    selectedCategory = this.dataset.category;
    document.querySelectorAll('.category-button').forEach(function (item) {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    showMenu();
  });
});

get('foodGrid').addEventListener('click', function (event) {
  const button = event.target.closest('[data-add]');
  if (button) addToCart(button.dataset.add);
});

// ================ SHOPPING CART ================
function addToCart(id) {
  const item = menu.find(function (food) { return food.id === id; });
  if (!item || !item.available) return message('This dish is not available.');

  // Food from different canteens cannot be mixed in one order.
  const existing = menu.find(function (food) { return cart[food.id] > 0; });
  if (existing && existing.canteen !== item.canteen) {
    return message('Finish or clear your current canteen order first.');
  }

  cart[id] = (cart[id] || 0) + 1;
  save('prebyte_simple_cart', cart);
  showCart();
  message(item.name + ' added to your tray!');
}

function changeQuantity(id, amount) {
  cart[id] = (cart[id] || 0) + amount;
  if (cart[id] <= 0) delete cart[id];
  save('prebyte_simple_cart', cart);
  showCart();
}

function showCart() {
  const items = menu.filter(function (food) { return cart[food.id] > 0; });
  let count = 0;
  let total = 0;
  get('cartItems').replaceChildren();

  items.forEach(function (food) {
    const qty = cart[food.id];
    count += qty;
    total += food.price * qty;
    const row = copyTemplate('cartTemplate');
    row.querySelector('.cart-item-name').textContent = food.name;
    row.querySelector('.cart-item-price').textContent = qty + ' × ' + rupees(food.price);
    row.querySelector('.qty-number').textContent = qty;
    row.querySelector('.qty-minus').dataset.id = food.id;
    row.querySelector('.qty-plus').dataset.id = food.id;
    // One-click removal is easier than repeatedly pressing the minus button.
    row.querySelector('.cart-remove').dataset.id = food.id;
    row.querySelector('.cart-remove').ariaLabel = 'Remove ' + food.name + ' from tray';
    get('cartItems').appendChild(row);
  });

  get('cartCount').textContent = count;
  get('topCartCount').textContent = count;
  get('cartTotal').textContent = rupees(total);
  get('cartEmpty').hidden = count > 0;
  get('clearCart').disabled = count === 0;
  get('checkoutForm').hidden = count === 0;
}

get('cartItems').addEventListener('click', function (event) {
  const minus = event.target.closest('.qty-minus');
  const plus = event.target.closest('.qty-plus');
  const remove = event.target.closest('.cart-remove');
  if (minus) changeQuantity(minus.dataset.id, -1);
  if (plus) changeQuantity(plus.dataset.id, 1);
  if (remove) removeFromCart(remove.dataset.id);
});

// Remove one whole dish from the cart, regardless of its quantity.
function removeFromCart(id) {
  delete cart[id];
  save('prebyte_simple_cart', cart);
  showCart();
  message('Item removed from your tray.');
}

get('clearCart').addEventListener('click', function () {
  if (!Object.keys(cart).length) return;
  cart = {};
  save('prebyte_simple_cart', cart);
  showCart();
  message('Your tray is clear.');
});

// ================ PLACE ORDER ================
get('checkoutForm').addEventListener('submit', function (event) {
  event.preventDefault();
  const items = menu.filter(function (food) { return cart[food.id] > 0; });
  if (!items.length) return message('Your tray is empty.');
  if (items.some(function (food) { return !food.available; })) {
    return message('One dish is no longer available. Please edit your tray.');
  }

  const name = get('studentName').value.trim();
  if (!name) return message('Please enter your name.');
  const itemsOrdered = items.map(function (food) {
    return { name: food.name, qty: cart[food.id], price: food.price };
  });
  const total = itemsOrdered.reduce(function (sum, food) {
    return sum + food.price * food.qty;
  }, 0);

  const order = {
    id: 'PB' + Date.now().toString().slice(-7) + Math.floor(Math.random() * 10),
    name: name,
    canteen: items[0].canteen,
    slot: get('pickupSlot').value,
    items: itemsOrdered,
    total: total,
    status: 'Placed',
    date: new Date().toLocaleString('en-IN')
  };

  orders.unshift(order);
  save('prebyte_simple_orders', orders);
  save('prebyte_simple_name', name);
  cart = {};
  save('prebyte_simple_cart', cart);
  showCart();
  showOrders();
  location.hash = 'orders';
  message('Order ' + order.id + ' placed! Pay at pickup.');
});

// ================ STUDENT ORDER HISTORY ================
function showOrders() {
  const list = get('ordersList');
  list.replaceChildren();
  get('ordersEmpty').hidden = orders.length > 0;
  if (!orders.length) return;

  orders.forEach(function (order) {
    const card = copyTemplate('orderTemplate');
    card.querySelector('.order-code').textContent = order.id;
    card.querySelector('.order-status').textContent = order.status;
    card.querySelector('.order-status').classList.add(order.status.toLowerCase().replaceAll(' ', '-'));
    card.querySelector('.order-info').textContent = order.name + ' • ' + canteens[order.canteen] + ' • ' + order.slot + ' • ' + order.date;
    card.querySelector('.order-products').textContent = order.items.map(function (food) {
      return food.qty + ' × ' + food.name;
    }).join(' · ');
    card.querySelector('.order-price').textContent = rupees(order.total);
    card.querySelector('.order-delete').dataset.orderId = order.id;
    card.querySelector('.order-delete').ariaLabel = 'Delete saved order ' + order.id;
    list.appendChild(card);
  });
}

// ================ DELETE SAVED ORDER ================
// Event delegation: one listener works for every Delete button in the list.
get('ordersList').addEventListener('click', function (event) {
  const button = event.target.closest('.order-delete');
  if (!button) return;

  const id = button.dataset.orderId;
  // Important: removing browser history does NOT cancel a real canteen order.
  const approved = window.confirm(
    'Delete saved order ' + id + '? This removes it from this browser only.'
  );
  if (!approved) return;

  orders = orders.filter(function (order) { return order.id !== id; });
  save('prebyte_simple_orders', orders);
  showOrders();
  message('Saved order deleted.');
});

// ================ FEEDBACK ================
get('feedbackForm').addEventListener('submit', function (event) {
  event.preventDefault();
  feedback.unshift({
    canteen: get('feedbackCanteen').value,
    rating: Number(get('feedbackRating').value),
    comment: get('feedbackComment').value.trim(),
    date: new Date().toLocaleDateString('en-IN')
  });
  save('prebyte_simple_feedback', feedback);
  get('feedbackForm').reset();
  showFeedback();
  message('Thank you for your feedback!');
});

function showFeedback() {
  get('feedbackList').replaceChildren();
  get('feedbackEmpty').hidden = feedback.length > 0;
  if (!feedback.length) return;
  feedback.slice(0, 6).forEach(function (item) {
    const review = copyTemplate('feedbackTemplate');
    review.querySelector('.review-stars').textContent = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
    review.querySelector('.review-comment').textContent = item.comment;
    review.querySelector('.review-meta').textContent = canteens[item.canteen] + ' • ' + item.date;
    get('feedbackList').appendChild(review);
  });
}

// ================ PAGE NAVIGATION ================
function showPage() {
  const pages = ['menu', 'orders', 'feedback'];
  const requested = location.hash.slice(1);
  const page = pages.includes(requested) ? requested : 'menu';
  pages.forEach(function (id) {
    get(id).hidden = id !== page;
  });
  document.querySelectorAll('[data-nav]').forEach(function (link) {
    link.classList.toggle('active', link.dataset.nav === page);
  });
  if (page === 'orders') showOrders();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showPage);

get('browseButton').addEventListener('click', function () {
  get('browse').scrollIntoView({ behavior: 'smooth' });
});
get('cartShortcut').addEventListener('click', function () {
  location.hash = 'menu';
  setTimeout(function () { get('cartPanel').scrollIntoView({ behavior: 'smooth' }); }, 30);
});

// Sync changes made in a second tab of the same browser.
window.addEventListener('storage', function () {
  cart = read('prebyte_simple_cart', {});
  orders = read('prebyte_simple_orders', []);
  feedback = read('prebyte_simple_feedback', []);
  showMenu(); showCart(); showOrders(); showFeedback();
});

// First render when the website opens.
get('studentName').value = read('prebyte_simple_name', '');
showMenu();
showCart();
showOrders();
showFeedback();
showPage();
