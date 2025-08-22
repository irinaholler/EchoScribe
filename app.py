from flask import Flask
app = Flask(__name__)
@app.get("/")
def home():
    return "EchoScribe is alive!"
if __name__ == "__main__":
    app.run(debug=True)

