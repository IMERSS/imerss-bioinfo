# Bagatelle

Import species and observation data and display in a sunburst partition layout inspired by <https://bl.ocks.org/mbostock/4348373>,
<https://www.jasondavies.com/coffee-wheel/>.

## Usage

Data is imported in CSV format from spreadsheets such as <https://docs.google.com/spreadsheets/d/1PFrevhUqTvl-re9_vEk-aKIUiezpsEJ0K6PjC5c6ahQ/edit#gid=0>.

The current workflow processes this using a command-line script, but will shortly be folded into the UI.

To convert a CSV file, run `marmalise.js` e.g. via a line such as

    node src/marmalise.js data/Animalia.csv data/Bacteria.csv data/Fungi.csv data/Plantae.csv > Life.json

Then remove the 3 lines of junk from the head of the JSON file and paste it into the `data` directory.

To run the web UI, host this project via some suitable static web server and then access its `index.html`.
