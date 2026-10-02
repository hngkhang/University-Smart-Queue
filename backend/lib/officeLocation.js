function officeLocation(location) {
  if (typeof location?.label === "string" && location.label.trim()) {
    return location.label.trim();
  }
  if (typeof location?.x === "number" && typeof location?.y === "number") {
    return `HCMUTE Campus (${location.x}, ${location.y})`;
  }
  return "HCMUTE Campus";
}

module.exports = officeLocation;
