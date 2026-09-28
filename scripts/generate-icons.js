const lucide = require('lucide');
const fs = require('fs');

const iconMap = {
  'sprout': lucide.Sprout,
  'car': lucide.Car,
  'dna': lucide.Dna,
  'briefcase': lucide.Briefcase,
  'flask-conical': lucide.FlaskConical,
  'utensils': lucide.Utensils,
  'graduation-cap': lucide.GraduationCap,
  'cpu': lucide.Cpu,
  'gamepad-2': lucide.Gamepad2,
  'sparkles': lucide.Sparkles,
  'gem': lucide.Gem,
  'zap': lucide.Zap,
  'lock': lucide.Lock,
  'trending-up': lucide.TrendingUp,
  'trending-down': lucide.TrendingDown,
  'volume-2': lucide.Volume2,
  'volume-x': lucide.VolumeX,
  'trophy': lucide.Trophy,
  'newspaper': lucide.Newspaper,
  'radio': lucide.Radio
};

const definitions = {};
for (const [key, icon] of Object.entries(iconMap)) {
  if (icon) {
    definitions[key] = icon;
  }
}

const code = `// Lucide SVG Icon Library for Risk Capital
window.LucideIcons = (function() {
  const icons = ${JSON.stringify(definitions)};

  const sectorIconMap = {
    agriculture: "sprout",
    auto_parts: "car",
    biotechnology: "dna",
    business_products_services: "briefcase",
    chemicals: "flask-conical",
    food_beverage: "utensils",
    education: "graduation-cap",
    electronics: "cpu",
    gaming: "gamepad-2",
    health_beauty: "sparkles",
    crypto: "gem",
    quickTrade: "zap",
    opt_safe: "sprout",
    opt_balanced: "dna",
    opt_high: "gem"
  };

  function getSvg(name, options) {
    options = options || {};
    const iconName = sectorIconMap[name] || name;
    const children = icons[iconName] || icons["gem"];
    if (!children) return "";
    const size = options.size || 20;
    const cls = options.className ? " " + options.className : "";
    const stroke = options.stroke || "currentColor";
    const strokeWidth = options.strokeWidth || 2;
    let inner = "";
    for (let i = 0; i < children.length; i++) {
      const tag = children[i][0];
      const props = children[i][1];
      inner += "<" + tag;
      for (const k in props) {
        inner += " " + k + '="' + props[k] + '"';
      }
      inner += "/>";
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon lucide-' + iconName + cls + '">' + inner + '</svg>';
  }

  function getSectorIcon(sectorId, options) {
    return getSvg(sectorIconMap[sectorId] || "gem", options);
  }

  return { getSvg, getSectorIcon, sectorIconMap };
})();
`;

fs.writeFileSync('public/icons.js', code);
console.log('Successfully generated public/icons.js! File size:', fs.statSync('public/icons.js').size, 'bytes');
