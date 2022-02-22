
var qtable = null;

function _render_num_null (data, type, full, meta) {
  var v = data;
  if (v === null) v = '(n/a)';
  if (v === undefined) v = '(n/a)';
  return '<div align="right">' + v + '</div>';
}

function _render_num_dash (data, type, full, meta) {
  return '<div align="right">' + (data || '-') + '</div>';
}

function _render_num_zero (data, type, full, meta) {
  return '<div align="right">' + (data || '0') + '</div>';
}

function _render_time_delta (data, type, full, meta) {
  return '<div align="center">' + (data ? getTimeDelta (data) : '-') + '</div>';
}

function _render_paused (data, type, full, meta) {
  return '<div align="center">' + (data ? '<b>PAUSED</b>' : '-') + '</div>';
}

function getTimeDelta (ts) {
  if ((ts == null) || (ts == undefined)) {
    return '-';
  }

  var delta = new Date (ts).getTime () - new Date ().getTime ();
  var positive = true;

  if (delta < 0) {
    positive = false;
    delta = -delta;
  }

  var dt_d = Math.floor (delta / (24*60*60*1000));
  delta = delta - (dt_d * 24*60*60*1000);

  var dt_h = Math.floor (delta / (60*60*1000));
  delta = delta - (dt_h * 60*60*1000);

  var dt_m = Math.floor (delta / (60*1000));
  delta = delta - (dt_m * 60*1000);

  var dt_s = delta / 1000;

  var res = positive ? '' : '- ';

  if (dt_d > 0) res = res + dt_d + 'd ';
  if (dt_h > 0) res = res + dt_h + 'h ';
  if (dt_m > 0) res = res + dt_m + 'm ';
  res = res + dt_s + 's';

  return res;
}


/////////////////////////////////////////
function refresh (){
/////////////////////////////////////////
  qtable.ajax.url ('/q?array=1').load();
}

/////////////////////////////////////////
$(function() {
/////////////////////////////////////////
  $.fn.dataTable.ext.errMode = 'none';

  $('#refresh-btn').click(function(eventObject) {
    refresh ();
  });

  $('#qtable')
  .on ('error.dt', function ( e, settings, techNote, message ) {
    $('#error-text').html (message);
    $('#error-panel').show ();
  })
  .on ('xhr.dt', function (e, settings, json, xhr ) {
    if (xhr.status != 200) {
      var xhr_txt = 'readyState: ' + xhr.readyState +
      ' responseJSON: ' + xhr.responseJSON +
      ' status:  ' + xhr.status +
      ' statusText: ' + xhr.statusText;

      $('#error-text').html ('Error while obtaining data from server. Response is [' + xhr_txt + ']');
      $('#error-panel').show ();
    }
  })
  .on('preXhr.dt', function (e, settings, data) {
    $('#error-panel').hide ();
    $('#error-text').html = '';
  });

  qtable = $('#qtable').DataTable({
    processing: true,
    select: 'single',
    ajax: '/q?array=1',
    columns: [
      {data: 'qg'},
      {data: 'name'},
      {data: 'stats.put',        render: _render_num_dash},
      {data: 'stats.get',        render: _render_num_dash},
      {data: 'stats.reserve',    render: _render_num_dash},
      {data: 'stats.commit',     render: _render_num_dash},
      {data: 'stats.rollback',   render: _render_num_dash},
      {data: 'stats.deadletter', render: _render_num_dash},
      {data: 'size',             render: _render_num_zero},
      {data: 'totalSize',        render: _render_num_zero},
      {data: 'schedSize',        render: _render_num_zero},
      {data: 'resvSize',         render: _render_num_null},
      {data: 'next_mature_t',    render: _render_time_delta},
      {data: 'paused',           render: _render_paused},
    ]
  });

  qtable.on ('select', function ( e, dt, type, indexes ) {
    //       console.log ('select: ', e, dt, type, indexes );
    if ( type === 'row' ) {
      var data = qtable.rows(indexes).data()[0];
      console.log ('select: ', data );

      // do something with the ID of the selected items
    }
  });
});
