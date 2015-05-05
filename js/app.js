App = Ember.Application.create({
  // LOG_TRANSITIONS: true,
  // LOG_ACTIVE_GENERATION: true,
  // LOG_VIEW_LOOKUPS: true
});

App.ApplicationAdapter = DS.RESTAdapter.extend({
    host: "http://response.travelonline.com.ua"
});

App.QuoteAdapter = DS.RESTAdapter.extend({
    host: "https://query.yahooapis.com",
    namespace: "v1/public",
    buildURL: function (type, id) {
        type = false;
        var url = this._super(type, id);
        return url;
    }
});

App.ChartAdapter = DS.RESTAdapter.extend({
    host: "http://response.travelonline.com.ua",
    pathForType: function (type) {
        var camelized = Ember.String.camelize(type);
        return camelized;
    }
});

App.ApplicationSerializer = DS.RESTSerializer.extend({
    primaryKey: "symbol",
    normalizePayload: function (payload) {
        var symbols = payload.ResultSet.Result;
        payload = {symbols: symbols};
        return payload;
    }
});

App.QuoteSerializer = DS.RESTSerializer.extend({
    primaryKey: "symbol",
    normalizePayload: function (payload) {
        payload = {quote: [payload.query.results.quote]};
        return payload;
    }
});

App.ChartSerializer = DS.RESTSerializer.extend({
    normalizePayload: function (payload) {
        payload = {chart: payload};
        return payload;
    }
});

var attr = DS.attr,
        hasMany = DS.hasMany,
        belongsTo = DS.belongsTo;

// Navigation helper function for autocomplete symbol lookup
var currentIndex = -1; // iterator to check if we are navigating with arrow keys
var searchResultIndex = -1; // so on arrow down we start at element 0
var navigate = function (direction) {
    searchResultIndex += direction;
    var results = $(".list-group-item");
    if (searchResultIndex >= results.length)
        searchResultIndex = 0;
    if (searchResultIndex < 0)
        searchResultIndex = results.length - 1;
    results.eq(searchResultIndex).focus();
    currentIndex = searchResultIndex;
};

App.Router.map(function() {
    this.resource("chart", function() {
        this.resource("quote", {path: "/:ticker"}, function() {
            this.resource("period", {path: "/:period"});
        });
    });
    this.route("404");
});

App.QuoteRoute = Ember.Route.extend({
    model: function(params) {
        var query = "yql?q=select%20*%20from%20yahoo.finance.quote%20where%20symbol%20in%20(%22"
                + params.ticker +
                "%22)&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=";
        var results = this.store.find("Quote", query);
        return results;
    },
    setupController: function(controller, model) {
        controller.set("content", model);
    }
});

App.PeriodRoute = Ember.Route.extend({
    model: function(params) {
        var ticker = this.modelFor("quote").get("id");
        var period = params.period;
        var results = this.store.find("Chart", {s: ticker, t: period}).then(function(data){
            return data;
        });
        return results;
    },
    afterModel: function(periodData, transition) {
      if (!periodData.get("length")) {
        this.transitionTo("404");
      }
    },
    setupController: function(controller, model) {
        this.controllerFor("quote").set("chartContent", model);
    },
    renderTemplate: function() {
        this.render("quote", {controller: "quote"});
    }
});

App.ApplicationController = Ember.ArrayController.extend({
    searchTerm: null,
    searchTermChanged: function() {
        // Wait half a second before sending the query
        Ember.run.debounce(this, this.doSearch, 500);
    }.observes("searchTerm"),
    doSearch: function() {
        var searchTerm = this.get("searchTerm");
        if (searchTerm) {
            this.set("isSearching", true);
            var controller = this;
            this.store.find("Symbol", {query: searchTerm})
                    .then(function(searchResults) {
                        controller.set("content", searchResults);
                        controller.set("isSearching", false);
                    });
        }
    },
    actions: {
        search: function(){
            this.doSearch(); // Just do it
        }
    }
});

App.QuoteController = Ember.ObjectController.extend({
    isLoading: true,
    chartContent: [],
    margin: "",
    width: "",
    height: "",
    parse: "",
    bisectDate: "",
    formatValue: "",
    formatCurrency: "",
    x: "",
    y: "",
    xAxis: "",
    yAxis: "",
    line: "",
    area: "",
    chart: "",
    updateChart: function() {
        var chart = this.chart;
        if (!chart) {
            return; //  bypass the init, render when DOM ready
        }
        var content = this.chartContent.toArray();
        var margin = this.margin;
        var width = this.width;
        var height = this.height;
        var parse = this.parse;
        var bisectDate = this.bisectDate;
        var formatValue = this.formatValue;
        var formatCurrency = this.formatCurrency;
        var x = this.x;
        var y = this.y;
        var xAxis = this.xAxis;
        var yAxis = this.yAxis;
        var line = this.line;
        var area = this.area;

        // Parse dates and numbers, and reverse them so latest date is on right
        content.reverse().forEach(function(d) {
            d.date = parse(d._data.Date);
            d.close = +d._data.Close;
        });
        // Scale the range of the data
        x.domain([content[0].date, content[content.length - 1].date]);
        // leave some margins for the domain range so data is not touching the x
        var yMin = (d3.min(content, function(d) {
            return d.close;
        }) * 0.99);
        var yMax = (d3.max(content, function(d) {
            return d.close;
        }) * 1.01);
        y.domain([yMin, yMax]);
        // Update x-axis
        chart.select(".x.axis")
                .transition()
                .call(xAxis);
        // Update y-axis
        chart.select(".y.axis")
                .transition()
                .call(yAxis);
        // Update line graph
        chart.selectAll("path.line")
                .data(content)
                .transition()
                .attr("d", line(content));
        // Update area graph
        chart.selectAll("path.area")
                .data(content)
                .transition()
                .attr("d", area(content));
        // Update overlay
        chart.select(".overlay")
                .on("mousemove", mousemove);
        function mousemove() {
            var x0 = x.invert(d3.mouse(this)[0]),
                    i = bisectDate(content, x0, 1),
                    d0 = content[i - 1],
                    d1 = content[i],
                    d = x0 - d0.date > d1.date - x0 ? d1 : d0;
            chart.select(".focus").attr("transform", "translate(" + x(d.date) + "," + y(d.close) + ")");
            chart.select(".focus").select("text").text(formatCurrency(d.close));
        }
    }.observes("chartContent"),
    actions: {
        render: function(elementId) {
            var content = this.chartContent.toArray();
            // Set the dimensions of the canvas / graph
            var margin = {top: 20, right: 30, bottom: 25, left: 50};
            var width = 770 - margin.left - margin.right;
            var height = 300 - margin.top - margin.bottom;
            // Parse the date / time
            var parse = d3.time.format("%Y-%m-%d").parse;
            var bisectDate = d3.bisector(function(d) {
                return d.date;
            }).left;
            // Format $$ Bill ya
            var formatValue = d3.format(",.2f");
            var formatCurrency = function(d) {
                return "$" + formatValue(d);
            };
            // Set the ranges
            var x = d3.time.scale().range([0, width]);
            var y = d3.scale.linear().range([height, 0]);
            // Define the axes
            var xAxis = d3.svg.axis()
                    .scale(x)
                    .orient("bottom");
            var yAxis = d3.svg.axis()
                    .scale(y)
//                .tickSize(-width)
                    .orient("left");
            // Define the line
            var line = d3.svg.line()
                    .x(function(d) {
                        return x(d.date);
                    })
                    .y(function(d) {
                        return y(d.close);
                    });
            // Define the area
            var area = d3.svg.area()
                    .x(function(d) {
                        return x(d.date);
                    })
                    .y0(height)
                    .y1(function(d) {
                        return y(d.close);
                    });
            // Adds the svg canvas
            var chart = d3.select("#" + elementId).append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .attr("viewBox", "0 0 "
                            + (width + margin.left + margin.right) + " "
                            + (height + margin.top + margin.bottom))
                    .attr("preserveAspectRatio", "xMinYMin")
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
            // Parse dates and numbers, and reverse them so latest date is on right
            content.reverse().forEach(function(d) {
                d.date = parse(d._data.Date);
                d.close = +d._data.Close;
            });
            // Scale the range of the data
            x.domain([content[0].date, content[content.length - 1].date]);
            // leave some margins for the domain range so data is not touching the x
            var yMin = (d3.min(content, function(d) {
                return d.close;
            }) * 0.99);
            var yMax = (d3.max(content, function(d) {
                return d.close;
            }) * 1.01);
            y.domain([yMin, yMax]);
            // Add the valuearea path.
            chart.append("path")
                    .datum(content)
                    .attr("class", "area")
                    .attr("d", area(content));
            chart.append("g")
                    .attr("class", "x axis")
                    .attr("preserveAspectRatio", "xMinYMin")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis);
            chart.append("g")
                    .attr("class", "y axis")
                    .call(yAxis)
                    .append("text")
                    .attr("transform", "rotate(-90)")
                    .attr("preserveAspectRatio", "xMinYMin")
                    .attr("y", 6)
                    .attr("dy", ".71em")
                    .style("text-anchor", "end")
                    .text("Price ($)");
            // Add the valueline path.        
            chart.append("path")
                    .datum(content)
                    .attr("class", "line")
                    .attr("d", line(content));
            // Mouse over value points
            var focus = chart.append("g")
                    .attr("class", "focus")
                    .style("display", "none");
            focus.append("circle")
                    .attr("r", 4.5);
            focus.append("text")
                    .attr("x", 9)
                    .attr("dy", ".35em");
            chart.append("rect")
                    .attr("class", "overlay")
                    .attr("width", width)
                    .attr("height", height)
                    .on("mouseover", function() {
                        focus.style("display", null);
                    })
                    .on("mouseout", function() {
                        focus.style("display", "none");
                    })
                    .on("mousemove", mousemove);
            function mousemove() {
                var x0 = x.invert(d3.mouse(this)[0]),
                        i = bisectDate(content, x0, 1),
                        d0 = content[i - 1],
                        d1 = content[i],
                        d = x0 - d0.date > d1.date - x0 ? d1 : d0;
                focus.attr("transform", "translate(" + x(d.date) + "," + y(d.close) + ")");
                focus.select("text").text(formatCurrency(d.close));
            }
            this.set("margin", margin);
            this.set("width", width);
            this.set("height", height);
            this.set("parse", parse);
            this.set("bisectDate", bisectDate);
            this.set("formatValue", formatValue);
            this.set("formatCurrency", formatCurrency);
            this.set("x", x);
            this.set("y", y);
            this.set("xAxis", xAxis);
            this.set("yAxis", yAxis);
            this.set("line", line);
            this.set("area", area);
            this.set("chart", chart);
        }
    }
});

App.Chart = DS.Model.extend({
    Date: attr(),
    Close: attr()
});

App.Quote = DS.Model.extend({
    Symbol: attr(),
    AverageDailyVolume: attr(),
    Change: attr(),
    DaysLow: attr(),
    DaysHigh: attr(),
    YearLow: attr(),
    YearHigh: attr(),
    MarketCapitalization: attr(),
    LastTradePriceOnly: attr(),
    DaysRange: attr(),
    Name: attr(),
    Volume: attr(),
    StockExchange: attr()
});

App.Symbol = DS.Model.extend({
    symbol: attr(),
    name: attr()
});

App.GraphView = Ember.View.extend({
    didInsertElement: function() {
        // D3 Chart
        var controller = this.get("controller");
        var elementId = this.get("elementId");
        Ember.run.scheduleOnce("afterRender",
                controller.send("render", elementId));
        controller.set("isLoading", false);
    }
});

App.QuoteView = Ember.View.extend({
    templateName: "quote"
});

App.SearchView = Ember.View.extend({
    results: "",
    didInsertElement: function() {
        this.results = $("#search-results-list"); // Cache DOM element lookup
    },
    focusIn: function() {
        this.results.slideDown();
    },
    keyUp: function(e) {
        if (e.which === 40) { // Down arrow key code.
            navigate(1);
        }
        else if (e.which === 38) { // UP arrow key code.
            navigate(-1);
        }
        else if (e.which === 27 || e.which === 13) { // Escape & Enter
            this.results.slideUp();
        } else {
            this.results.slideDown(); // After Escape value change ie: Backspace
        }
    },
    focusOut: function() { // Clicked outside of the search box
        if (currentIndex === searchResultIndex) { // If not navigating
            this.results.slideUp();
        }
    }
});

App.Symbol.FIXTURES = [{"id": "1", "symbol": "A", "name": "Agilent Technologies Inc.", "exch": "NYQ", "type": "S", "exchDisp": "NYSE", "typeDisp": "Equity"}, {"id": "2", "symbol": "ASK.PA", "name": "ASK", "exch": "PAR", "type": "S", "exchDisp": "Paris", "typeDisp": "Equity"}, {"id": "3", "symbol": "AAPL", "name": "Apple Inc.", "exch": "NMS", "type": "S", "exchDisp": "NASDAQ", "typeDisp": "Equity"}, {"id": "4", "symbol": "^DJI", "name": "Dow Jones Industrial Average", "exch": "DJI", "type": "I", "typeDisp": "Index"}, {"id": "5", "symbol": "BAC", "name": "Bank of America Corporation", "exch": "NYQ", "type": "S", "exchDisp": "NYSE", "typeDisp": "Equity"}, {"id": "6", "symbol": "YHOO", "name": "Yahoo! Inc.", "exch": "NMS", "type": "S", "exchDisp": "NASDAQ", "typeDisp": "Equity"}, {"id": "7", "symbol": "AMZN", "name": "Amazon.com Inc.", "exch": "NMS", "type": "S", "exchDisp": "NASDAQ", "typeDisp": "Equity"}, {"id": "8", "symbol": "T", "name": "AT&T, Inc.", "exch": "NYQ", "type": "S", "exchDisp": "NYSE", "typeDisp": "Equity"}, {"id": "9", "symbol": "AAP", "name": "Advance Auto Parts Inc.", "exch": "NYQ", "type": "S", "exchDisp": "NYSE", "typeDisp": "Equity"}, {"id": "10", "symbol": "AA", "name": "Alcoa Inc.", "exch": "NYQ", "type": "S", "exchDisp": "NYSE", "typeDisp": "Equity"}];
//https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20yahoo.finance.quote%20where%20symbol%20in%20(%22YHOO%22)&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=
App.Quote.FIXTURES = [{"id": "1","symbol":"YHOO","AverageDailyVolume":"19965500","Change":"+0.50","DaysLow":"34.78","DaysHigh":"35.56","YearLow":"26.73","YearHigh":"41.72","MarketCapitalization":"35.671B","LastTradePriceOnly":"35.43","DaysRange":"34.78 - 35.56","Name":"Yahoo! Inc.","Symbol":"YHOO","Volume":"18379520","StockExchange":"NasdaqNM"}];
