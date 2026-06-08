import pandas as pd

df = pd.read_csv(r'E:\Dronelog_ai\dronelog_ai\csv_files\flight7.csv')
print('Rows:', len(df))
print('Columns:', list(df.columns))
print(df.head(3))