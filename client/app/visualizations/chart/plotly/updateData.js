import { each, extend, filter, identity, includes, map, sortBy, get } from 'lodash';
import { createNumberFormatter, formatSimpleTemplate } from '@/lib/value-format';
import { normalizeValue } from './utils';

function defaultFormatSeriesText(item) {
  let result = item['@@y'];
  if (item['@@yError'] !== undefined) {
    result = `${result} \u00B1 ${item['@@yError']}`;
  }
  if (item['@@yPercent'] !== undefined) {
    result = `${item['@@yPercent']} (${result})`;
  }
  if (item['@@size'] !== undefined) {
    result = `${result}: ${item['@@size']}`;
  }
  return result;
}

function defaultFormatSeriesTextForPie(item) {
  return item['@@yPercent'] + ' (' + item['@@y'] + ')';
}

function createTextFormatter(options) {
  if (options.textFormat === '') {
    return options.globalSeriesType === 'pie' ? defaultFormatSeriesTextForPie : defaultFormatSeriesText;
  }
  return item => formatSimpleTemplate(options.textFormat, item);
}

function formatValue(value, axis, options) {
  let axisType = null;
  switch (axis) {
    case 'x': axisType = get(options, 'xAxis.type', null); break;
    case 'y': axisType = get(options, 'yAxis[0].type', null); break;
    case 'y2': axisType = get(options, 'yAxis[1].type', null); break;
    // no default
  }
  return normalizeValue(value, axisType, options.dateTimeFormat);
}

function updateSeriesText(seriesList, options) {
  const formatNumber = createNumberFormatter(options.numberFormat);
  const formatPercent = createNumberFormatter(options.percentFormat);
  const formatText = createTextFormatter(options);

  each(seriesList, (series) => {
    const seriesOptions = options.seriesOptions[series.name] || { type: options.globalSeriesType };

    series.text = [];
    series.hover = [];
    const xValues = (options.globalSeriesType === 'pie') ? series.labels : series.x;
    xValues.forEach((x) => {
      const text = {
        '@@name': series.name,
      };
      const item = series.sourceData.get(x);
      if (item) {
        const yValueIsAny = includes(['bubble', 'scatter'], seriesOptions.type);

        text['@@x'] = formatValue(item.row.x, 'x', options);
        text['@@y'] = yValueIsAny ? formatValue(item.row.y, series.yaxis, options) : formatNumber(item.y);
        if (item.yError !== undefined) {
          text['@@yError'] = formatNumber(item.yError);
        }
        if (item.size !== undefined) {
          text['@@size'] = formatNumber(item.size);
        }

        if (options.series.percentValues || (options.globalSeriesType === 'pie')) {
          text['@@yPercent'] = formatPercent(Math.abs(item.yPercent));
        }

        extend(text, item.row.$raw);
      }

      series.text.push(formatText(text));
    });
  });
}

function updatePercentValues(seriesList, options) {
  if (options.series.percentValues) {
    // Some series may not have corresponding x-values;
    // do calculations for each x only for series that do have that x
    const sumOfCorrespondingPoints = new Map();
    each(seriesList, (series) => {
      series.sourceData.forEach((item) => {
        const sum = sumOfCorrespondingPoints.get(item.x) || 0;
        sumOfCorrespondingPoints.set(item.x, sum + Math.abs(item.y));
      });
    });

    each(seriesList, (series) => {
      const yValues = [];

      series.sourceData.forEach((item) => {
        const sum = sumOfCorrespondingPoints.get(item.x);
        item.yPercent = item.y / sum * 100;
        yValues.push(item.yPercent);
      });

      series.y = yValues;
    });
  }
}

function getUnifiedXAxisValues(seriesList, sorted) {
  const set = new Set();
  each(seriesList, (series) => {
    // `Map.forEach` will walk items in insertion order
    series.sourceData.forEach((item) => {
      set.add(item.x);
    });
  });

  const result = [];
  // `Set.forEach` will walk items in insertion order
  set.forEach((item) => {
    result.push(item);
  });

  return sorted ? sortBy(result, identity) : result;
}

function updateUnifiedXAxisValues(seriesList, options, defaultY) {
  const unifiedX = getUnifiedXAxisValues(seriesList, options.sortX);
  defaultY = defaultY === undefined ? null : defaultY;
  each(seriesList, (series) => {
    series.x = [];
    series.y = [];
    series.error_y.array = [];
    each(unifiedX, (x) => {
      series.x.push(x);
      const item = series.sourceData.get(x);
      if (item) {
        series.y.push(options.series.percentValues ? item.yPercent : item.y);
        series.error_y.array.push(item.yError);
      } else {
        series.y.push(defaultY);
        series.error_y.array.push(null);
      }
    });
  });
}

function updatePieData(seriesList, options) {
  updateSeriesText(seriesList, options);
}

function updateLineAreaData(seriesList, options) {
  // Apply "percent values" modification
  updatePercentValues(seriesList, options);
  if (options.series.stacking) {
    updateUnifiedXAxisValues(seriesList, options, 0);

    // Calculate cumulative value for each x tick
    let prevSeries = null;
    each(seriesList, (series) => {
      if (prevSeries) {
        series.y = map(series.y, (y, i) => prevSeries.y[i] + y);
      }
      prevSeries = series;
    });
  } else {
    const useUnifiedXAxis = options.sortX && (options.xAxis.type === 'category') && (options.globalSeriesType !== 'box');
    if (useUnifiedXAxis) {
      updateUnifiedXAxisValues(seriesList, options);
    }
  }

  // Finally - update text labels
  updateSeriesText(seriesList, options);
}

function updateDefaultData(seriesList, options) {
  // Apply "percent values" modification
  updatePercentValues(seriesList, options);

  if (!options.series.stacking) {
    const useUnifiedXAxis = options.sortX && (options.xAxis.type === 'category') && (options.globalSeriesType !== 'box');
    if (useUnifiedXAxis) {
      updateUnifiedXAxisValues(seriesList, options);
    }
  }

  // Finally - update text labels
  updateSeriesText(seriesList, options);
}

export default function updateData(seriesList, options) {
  // Use only visible series
  const visibleSeriesList = filter(seriesList, s => s.visible === true);

  if (visibleSeriesList.length > 0) {
    switch (options.globalSeriesType) {
      case 'pie':
        updatePieData(visibleSeriesList, options);
        break;
      case 'line':
      case 'area':
        updateLineAreaData(visibleSeriesList, options);
        break;
      case 'heatmap':
        break;
      default:
        updateDefaultData(visibleSeriesList, options);
        break;
    }
  }
  return seriesList;
}
