import React from 'react';
import PropTypes from 'prop-types';
import { filter, isEmpty } from 'lodash';
import { markdown } from 'markdown';
import classNames from 'classnames';
import Menu from 'antd/lib/menu';
import Modal from 'antd/lib/modal';
import { currentUser } from '@/services/auth';
import recordEvent from '@/services/recordEvent';
import { $location } from '@/services/ng';
import { formatDateTime } from '@/filters/datetime';
import HtmlContent from '@/components/HtmlContent';
import { Parameters } from '@/components/Parameters';
import { TimeAgo } from '@/components/TimeAgo';
import QueryLink from '@/components/QueryLink';
import { FiltersType } from '@/components/Filters';
import ExpandedWidgetDialog from '@/components/dashboards/ExpandedWidgetDialog';
import { VisualizationRenderer } from '@/visualizations/VisualizationRenderer';
import Widget from './Widget';

const VisualizationWidgetMenuOptions = [
  <Menu.Item key="download_csv">Download as CSV File</Menu.Item>,
  <Menu.Item key="download_excel">Download as Excel File</Menu.Item>,
  <Menu.Divider key="divider" />,
  <Menu.Item key="view_query">View Query</Menu.Item>,
  <Menu.Item key="edit_parameters">Edit Parameters</Menu.Item>,
];

function RestrictedWidget(props) {
  return (
    <Widget {...props} className="d-flex justify-content-center align-items-center widget-restricted">
      <div className="t-body scrollbox">
        <div className="text-center">
          <h1><span className="zmdi zmdi-lock" /></h1>
          <p className="text-muted">
            {'This widget requires access to a data source you don\'t have access to.'}
          </p>
        </div>
      </div>
    </Widget>
  );
}

function VisualizationWidgetHeader({ widget }) {
  const canViewQuery = currentUser.hasPermission('view_query');

  return (
    <>
      <div className="th-title">
        <p>
          <QueryLink query={widget.getQuery()} visualization={widget.visualization} readOnly={!canViewQuery} />
        </p>
        <HtmlContent className="text-muted query--description">
          {markdown.toHTML(widget.getQuery().description || '')}
        </HtmlContent>
      </div>
    </>
  );
}

VisualizationWidgetHeader.propTypes = {
  widget: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

class VisualizationWidget extends React.Component {
  static propTypes = {
    widget: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
    filters: FiltersType,
    isPublic: PropTypes.bool,
    canEdit: PropTypes.bool,
    onDelete: PropTypes.func,
  };

  static defaultProps = {
    filters: [],
    isPublic: false,
    canEdit: false,
    onDelete: () => {},
  };

  state = {
    refreshClickButtonId: null,
  };

  componentDidMount() {
    const { widget } = this.props;
    recordEvent('view', 'query', widget.visualization.query.id, { dashboard: true });
    recordEvent('view', 'visualization', widget.visualization.id, { dashboard: true });
    this.loadWidget();
  }

  loadWidget = (refresh = false) => {
    const { widget } = this.props;
    const maxAge = $location.search().maxAge;
    return widget.load(refresh, maxAge);
  };

  expandWidget = () => {
    ExpandedWidgetDialog.showModal({ widget: this.props.widget });
  };

  deleteWidget = () => {
    const { widget, onDelete } = this.props;

    Modal.confirm({
      title: 'Delete Widget',
      content: 'Are you sure you want to remove this widget from the dashboard?',
      okText: 'Delete',
      okType: 'danger',
      onOk: () => widget.delete().then(onDelete),
      maskClosable: true,
      autoFocusButton: null,
    });
  };

  refreshWidget = (refreshClickButtonId) => {
    if (!this.state.refreshClickButtonId) {
      this.setState({ refreshClickButtonId });
      this.loadWidget(true).finally(() => this.setState({ refreshClickButtonId: null }));
    }
  };

  // eslint-disable-next-line class-methods-use-this
  renderVisualization() {
    const { widget, filters } = this.props;
    const widgetQueryResult = widget.getQueryResult();
    const widgetStatus = widgetQueryResult && widgetQueryResult.getStatus();
    switch (widgetStatus) {
      case 'failed':
        return (
          <div className="body-row-auto scrollbox">
            {widgetQueryResult.getError() && (
              <div className="alert alert-danger m-5">
                Error running query: <strong>{widgetQueryResult.getError()}</strong>
              </div>
            )}
          </div>
        );
      case 'done':
        return (
          <div className="body-row-auto scrollbox">
            <VisualizationRenderer
              visualization={widget.visualization}
              queryResult={widgetQueryResult}
              filters={filters}
            />
          </div>
        );
      default:
        return (
          <div className="body-row-auto spinner-container">
            <div className="spinner">
              <i className="zmdi zmdi-refresh zmdi-hc-spin zmdi-hc-5x" />
            </div>
          </div>
        );
    }
  }

  renderBottom() {
    const { widget, isPublic } = this.props;
    const widgetQueryResult = widget.getQueryResult();
    const updatedAt = widgetQueryResult && widgetQueryResult.getUpdatedAt();
    const { refreshClickButtonId } = this.state;
    return (
      <>
        {(!isPublic && !!widgetQueryResult) && (
          <a
            className="refresh-button hidden-print btn btn-sm btn-default btn-transparent"
            onClick={() => this.refreshWidget(1)}
            data-test="RefreshButton"
          >
            <i className={classNames('zmdi zmdi-refresh', { 'zmdi-hc-spin': refreshClickButtonId === 1 })} />{' '}
            <TimeAgo date={updatedAt} />
          </a>
        )}
        <span className="visible-print">
          <i className="zmdi zmdi-time-restore" />{' '}{formatDateTime(updatedAt)}
        </span>
        {isPublic ? (
          <span className="small hidden-print">
            <i className="zmdi zmdi-time-restore" />{' '}<TimeAgo date={updatedAt} />
          </span>
        ) : (
          <a
            className="btn btn-sm btn-default pull-right hidden-print btn-transparent btn__refresh"
            onClick={() => this.refreshWidget(2)}
          >
            <i className={classNames('zmdi zmdi-refresh', { 'zmdi-hc-spin': refreshClickButtonId === 2 })} />
          </a>
        )}
        <a
          className="btn btn-sm btn-default pull-right hidden-print btn-transparent btn__refresh"
          onClick={this.expandWidget}
        >
          <i className="zmdi zmdi-fullscreen" />
        </a>
      </>
    );
  }

  render() {
    const { widget } = this.props;
    const widgetQueryResult = widget.getQueryResult();
    const isRefreshing = widget.loading && !!(widgetQueryResult && widgetQueryResult.getStatus());
    const localParameters = filter(
      widget.getParametersDefs(),
      param => !widget.isStaticParam(param),
    );

    return !widget.restricted ? (
      <Widget
        {...this.props}
        className="widget-visualization"
        menuOptions={VisualizationWidgetMenuOptions}
        header={<VisualizationWidgetHeader widget={widget} />}
        footer={this.renderBottom()}
        refreshStartedAt={isRefreshing ? widget.refreshStartedAt : null}
      >
        <div className="widget-parameters">
          {!isEmpty(localParameters) && (
            <div className="m-b-5">
              <Parameters parameters={localParameters} onValuesChange={this.refreshWidget} />
            </div>
          )}
        </div>
        {this.renderVisualization()}
      </Widget>
    ) : <RestrictedWidget widget={widget} />;
  }
}

export default VisualizationWidget;
