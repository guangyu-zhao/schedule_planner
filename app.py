from flask import Flask
from database import init_db
from routes import register_blueprints

app = Flask(__name__)
register_blueprints(app)

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
