function formatDate(timestamp) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp));
}

export function stampPhoto(video, photo) {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || !height) throw new Error('The camera is not ready yet. Try again in a moment.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot add a photo stamp.');
  const zoom = Math.max(1, Number(photo.zoom) || 1);
  const cropWidth = width / zoom;
  const cropHeight = height / zoom;
  context.drawImage(video, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);

  const scale = width / 520;
  const padding = 18 * scale;
  const addressLineHeight = 22 * scale;
  const dateLineHeight = 14 * scale;
  const addressFont = `700 ${16 * scale}px system-ui, sans-serif`;
  const dateFont = `500 ${11 * scale}px system-ui, sans-serif`;
  context.font = addressFont;
  const maxTextWidth = Math.min(width - padding * 2, width * 0.88);
  const availableLineWidth = maxTextWidth - padding * 2;
  const addressWords = (photo.location?.place || 'Place name unavailable').split(/\s+/);
  const placeLines = [];
  let currentLine = '';
  for (const word of addressWords) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (currentLine && context.measureText(candidate).width > availableLineWidth) {
      placeLines.push(currentLine);
      currentLine = word;
    } else currentLine = candidate;
  }
  if (currentLine) placeLines.push(currentLine);
  context.font = dateFont;
  const captureDate = formatDate(photo.createdAt);
  const measuredWidth = Math.max(
    context.measureText(captureDate).width,
    ...placeLines.map(line => {
      context.font = addressFont;
      return context.measureText(line).width;
    })
  );
  const boxWidth = Math.min(maxTextWidth, measuredWidth + padding * 2);
  const boxHeight = padding * 2 + placeLines.length * addressLineHeight + 5 * scale + dateLineHeight;
  const x = padding;
  const y = height - padding - boxHeight;
  context.beginPath();
  context.roundRect(x, y, boxWidth, boxHeight, 9 * scale);
  context.fillStyle = 'rgba(8, 12, 16, .76)';
  context.fill();
  context.fillStyle = '#f6fff9';
  context.font = addressFont;
  placeLines.forEach((line, index) => context.fillText(
    line, x + padding, y + padding + (index + 1) * addressLineHeight - addressLineHeight * 0.17,
    boxWidth - padding * 2
  ));
  context.font = dateFont;
  context.fillStyle = '#d8dfdb';
  context.fillText(captureDate, x + padding, y + boxHeight - padding * 0.65, boxWidth - padding * 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The photo could not be saved. Please try again.'));
    }, 'image/jpeg', 0.93);
  });
}

export function formatPhotoDate(timestamp, withTime = true) {
  const options = withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat(undefined, options).format(new Date(timestamp));
}

export function formatCoordinates(location) {
  return `${location.latitude.toFixed(6)}°, ${location.longitude.toFixed(6)}°`;
}
